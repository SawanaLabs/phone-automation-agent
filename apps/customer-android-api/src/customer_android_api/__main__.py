from __future__ import annotations

import uvicorn

from customer_android_api.app import create_app
from customer_android_api.config import load_settings
from customer_android_api.model_provider import build_model_provider_from_env


def main() -> None:
    settings = load_settings()
    uvicorn.run(
        create_app(
            runtime_token=settings.runtime_access_token,
            model_provider=build_model_provider_from_env(),
            load_env=False,
        ),
        host=settings.host,
        port=settings.port,
    )


if __name__ == "__main__":
    main()
