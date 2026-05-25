# C:\Users\KIIT\Documents\Visual Studio 2022\Projects\AiChatBot\AiCalls\tests\test_router.py
import logging
import sys
import os

# Suppress internal startup warnings completely
logging.basicConfig(level=logging.CRITICAL)
logging.getLogger("litellm").setLevel(logging.CRITICAL)

import asyncio
import time
import litellm
from litellm import Router
from litellm_config import LITELLM_ROUTER_CONFIG

# Force clean console outputs without internal framework noise
litellm.set_verbose = False

router = Router(**LITELLM_ROUTER_CONFIG)

async def test_single_model(tier: str, model_string: str):
    print(f"Pinging Tier [{tier}] -> Endpoint: {model_string}... ", end="", flush=True)
    start_time = time.time()
    try:
        if tier == "free-embed":
            # Pass a fast timeout limit parameter to stop freeze hangs
            await asyncio.wait_for(
                router.aembedding(model="free-embed", input=["ping"]),
                timeout=10.0
            )
        else:
            await asyncio.wait_for(
                router.acompletion(
                    model=model_string,
                    messages=[{"role": "user", "content": "ping"}],
                    max_tokens=1
                ),
                timeout=10.0
            )
        latency = time.time() - start_time
        print(f"✅ ONLINE ({latency:.2f}s)")
    except asyncio.TimeoutError:
        print("❌ OFFLINE (Reason: Connection Timed Out after 10s)")
    except Exception as e:
        err_msg = str(e).split('\n')[0][:60]
        print(f"❌ OFFLINE (Reason: {err_msg})")

async def test_all_routes():
    print("🔮 Starting Automated Free Tier API End-to-End Diagnostics...\n")
    
    for item in LITELLM_ROUTER_CONFIG["model_list"]:
        tier = item["model_name"]
        model_string = item["litellm_params"]["model"]
        
        await test_single_model(tier, model_string)
        # Delay to prevent triggering OpenRouter rate limit blocks during the test loop
        await asyncio.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(test_all_routes())