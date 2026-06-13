from __future__ import annotations

from secrets import compare_digest

from fastapi import FastAPI, Header, HTTPException

from customer_android_api.agent import (
    CustomerStepAgent,
    CustomerStepAgentError,
    ModelProvider,
)
from customer_android_api.config import load_settings
from customer_android_api.model_provider import build_model_provider_from_env
from customer_android_api.models import (
    CustomerSessionSnapshot,
    SessionCreateRequest,
    CustomerStepRequest,
    CustomerStepResponse,
)
from customer_android_api.store import SessionStore


def create_app(
    *,
    runtime_token: str | None = None,
    model_provider: ModelProvider | None = None,
    session_store: SessionStore | None = None,
    load_env: bool = True,
) -> FastAPI:
    settings = load_settings(
        load_env=load_env,
        runtime_token_override=runtime_token,
    )

    app = FastAPI(title="Customer Android API")
    store = session_store or SessionStore()
    step_agent = CustomerStepAgent(
        model_provider=model_provider or build_model_provider_from_env()
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
        session = store.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found.")

        try:
            action = step_agent.decide(session=session, request=request)
        except CustomerStepAgentError as error:
            action = {
                "_metadata": "failed",
                "message": str(error),
            }
        return CustomerStepResponse(action=action)

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
