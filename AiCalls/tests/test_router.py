# AiCalls/tests/liteLLM_LOW_MODELs.py
import time
from litellm import check_model_health

# Pull the configuration dictionary smoothly
from litellm_config import LITELLM_ROUTER_CONFIG

def test_all_routes():
    print("🔮 Starting automated diagnostic verification checks...\n")
    for item in LITELLM_ROUTER_CONFIG["model_list"]:
        tier = item["model_name"]
        model_string = item["litellm_params"]["model"]
        
        print(f"Pinging Tier [{tier}] -> Endpoint: {model_string}... ", end="", flush=True)
        try:
            is_alive = check_model_health(
                model=model_string,
                mode="embedding" if tier == "free-embed" else "chat"
            )
            print("✅ ONLINE") if is_alive else print("❌ OFFLINE")
        except Exception as e:
            print(f"💥 CRASHED! (Error: {str(e).split('...')[0]})")
        time.sleep(0.4)

if __name__ == "__main__":
    test_all_routes()