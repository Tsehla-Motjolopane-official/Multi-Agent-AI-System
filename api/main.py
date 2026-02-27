import os
import subprocess
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import docker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

BASE_DIR = Path(__file__).parent.parent
INPUT_DIR = BASE_DIR / "data" / "input"
OUTPUT_FILE = BASE_DIR / "output" / "daily_digest.md"

AGENTS = ["agent_ingestor", "agent_summarizer", "agent_prioritizer", "agent_formatter"]

app = FastAPI(title="Multi-Agent Digest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    content: str


DOCKER_SOCKETS = [
    "unix:///var/run/docker.sock",
    f"unix://{Path.home()}/.docker/run/docker.sock",
    f"unix://{Path.home()}/Library/Containers/com.docker.docker/Data/docker.sock",
]


def get_docker_client():
    for socket in DOCKER_SOCKETS:
        try:
            client = docker.DockerClient(base_url=socket)
            client.ping()
            return client
        except Exception:
            continue
    raise HTTPException(
        status_code=500,
        detail="Docker is not running. Please start Docker Desktop and try again."
    )


@app.post("/run")
def run_pipeline(req: RunRequest):
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    (BASE_DIR / "output").mkdir(parents=True, exist_ok=True)

    input_file = INPUT_DIR / "input.txt"
    input_file.write_text(req.content, encoding="utf-8")
    logger.info(f"Wrote input to {input_file}")

    # Remove stale output so status polling starts fresh
    if OUTPUT_FILE.exists():
        OUTPUT_FILE.unlink()

    # Remove any previously exited containers so docker compose can recreate them
    client = get_docker_client()
    for name in AGENTS:
        try:
            container = client.containers.get(name)
            container.remove(force=True)
            logger.info(f"Removed stale container {name}")
        except docker.errors.NotFound:
            pass

    subprocess.Popen(
        ["docker", "compose", "up", "--build"],
        cwd=str(BASE_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    logger.info("Pipeline started")
    return {"status": "started"}


@app.get("/status")
def get_status():
    client = get_docker_client()
    result = []
    for name in AGENTS:
        label = name.replace("agent_", "")
        try:
            container = client.containers.get(name)
            state = container.status  # created, running, exited
            exit_code = container.attrs["State"].get("ExitCode", None)
            if state == "exited":
                status = "done" if exit_code == 0 else "error"
            elif state == "running":
                status = "running"
            else:
                status = "pending"
        except docker.errors.NotFound:
            status = "pending"
        result.append({"agent": label, "status": status})
    return {"agents": result}


@app.get("/output")
def get_output():
    if not OUTPUT_FILE.exists():
        return {"ready": False, "content": ""}
    content = OUTPUT_FILE.read_text(encoding="utf-8")
    return {"ready": True, "content": content}


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
