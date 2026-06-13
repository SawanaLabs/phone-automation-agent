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
    max_steps: int | None = None,
    load_env: bool = True,
) -> FastAPI:
    settings = load_settings(
        load_env=load_env,
        runtime_token_override=runtime_token,
        max_steps_override=max_steps,
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
        session = store.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found.")

        action = _preflight_step_action(
            request=request,
            max_steps=settings.max_steps,
            session=session,
        )
        if action is not None:
            if not _is_terminal_status(session.task.status):
                store.record_step_decision(
                    session_id=session_id,
                    step_number=request.stepNumber,
                    action=action,
                )
            return CustomerStepResponse(action=action)

        action = _decide_action(
            request=request,
            session=session,
            step_agent=step_agent,
        )
        store.record_step_decision(
            session_id=session_id,
            step_number=request.stepNumber,
            action=action,
        )
        return CustomerStepResponse(action=action)

    return app


def _preflight_step_action(
    *,
    request: CustomerStepRequest,
    max_steps: int,
    session: CustomerSessionSnapshot,
) -> dict[str, object] | None:
    if _is_terminal_status(session.task.status):
        return {
            "_metadata": "failed",
            "message": (
                f"Session is already {session.task.status}; no more steps are accepted."
            ),
        }

    if request.stepNumber > max_steps:
        return {
            "_metadata": "failed",
            "message": (
                f"Hosted routine action loop exceeded {max_steps} steps without finish."
            ),
        }

    if request.stepNumber != session.nextStepNumber:
        return {
            "_metadata": "failed",
            "message": f"Expected step {session.nextStepNumber}, got {request.stepNumber}.",
        }

    return None


def _decide_action(
    *,
    request: CustomerStepRequest,
    session: CustomerSessionSnapshot,
    step_agent: CustomerStepAgent,
) -> dict[str, object]:
    try:
        return step_agent.decide(session=session, request=request)
    except CustomerStepAgentError as error:
        return {
            "_metadata": "failed",
            "message": str(error),
        }


def _is_terminal_status(status: str) -> bool:
    return status in {"finished", "failed", "stopped"}


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
