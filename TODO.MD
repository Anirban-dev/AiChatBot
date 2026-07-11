cd frontend
npm run dev

cd backend
npm run dev

cd aicalls
uv run main.py

# Run dev in root
# Run mongodb
# Run docker ai


uv run -m tests.test_router
uv run -m tests.test_router large huggingface/deepseek-ai/DeepSeek-V4-Pro

make admin : npm run make-admin user@example.com

docker compose -f docker-compose-utils.yaml up -d


LIGHTENING AI
export OLLAMA_HOST=0.0.0.0
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH
~/bin/ollama serve &
~/bin/ollama run gemma3:12b "hi"