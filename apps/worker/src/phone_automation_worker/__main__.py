import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "phone_automation_worker.app:create_app",
        factory=True,
        host=os.getenv("PHONE_AUTOMATION_WORKER_HOST", "127.0.0.1"),
        port=int(os.getenv("PHONE_AUTOMATION_WORKER_PORT", "8765")),
    )


if __name__ == "__main__":
    main()
