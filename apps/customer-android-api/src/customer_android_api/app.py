from __future__ import annotations

from secrets import compare_digest

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from customer_android_api.agent import (
    CustomerStepAgent,
    ModelProvider,
)
from customer_android_api.config import load_settings
from customer_android_api.model_provider import build_model_provider_from_env
from customer_android_api.models import (
    CustomerSessionSnapshot,
    CustomerStepRequest,
    CustomerStepResponse,
    SessionCreateRequest,
)
from customer_android_api.step_lifecycle import (
    CustomerStepLifecycle,
    CustomerStepSessionNotFoundError,
)
from customer_android_api.store import SessionStore


def create_app(
    *,
    runtime_token: str | None = None,
    model_provider: ModelProvider | None = None,
    session_store: SessionStore | None = None,
    max_steps: int | None = None,
    load_env: bool = True,
) -> FastAPI:
    settings = load_settings(
        load_env=load_env,
        runtime_token_override=runtime_token,
        max_steps_override=max_steps,
    )

    app = FastAPI(title="Customer Android API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    store = session_store or SessionStore()
    step_agent = CustomerStepAgent(
        model_provider=model_provider or build_model_provider_from_env()
    )
    step_lifecycle = CustomerStepLifecycle(
        store=store,
        step_agent=step_agent,
        max_steps=settings.max_steps,
    )

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/sessions", response_model=CustomerSessionSnapshot, status_code=201)
    def create_session(
        request: SessionCreateRequest,
        authorization: str | None = Header(default=None),
    ) -> CustomerSessionSnapshot:
        require_runtime_token(authorization, settings.runtime_access_token)
        return store.create_session(instruction=request.instruction)

    @app.get("/sessions/{session_id}", response_model=CustomerSessionSnapshot)
    def get_session(
        session_id: str,
        authorization: str | None = Header(default=None),
    ) -> CustomerSessionSnapshot:
        require_runtime_token(authorization, settings.runtime_access_token)
        session = store.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        return session

    @app.post(
        "/sessions/{session_id}/steps",
        response_model=CustomerStepResponse,
    )
    def create_step_decision(
        session_id: str,
        request: CustomerStepRequest,
        authorization: str | None = Header(default=None),
    ) -> CustomerStepResponse:
        require_runtime_token(authorization, settings.runtime_access_token)
        try:
            return step_lifecycle.create_step_decision(
                session_id=session_id,
                request=request,
            )
        except CustomerStepSessionNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error

    return app


def require_runtime_token(authorization: str | None, runtime_token: str) -> None:
    if authorization is None:
        raise HTTPException(
            status_code=401,
            detail="Runtime access token is required.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not token or not compare_digest(token, runtime_token):
        raise HTTPException(
            status_code=401,
            detail="Runtime access token is invalid.",
        )
