# lib/llm_admin_logger.py


import os
import redis as redis_lib
import litellm
from datetime import datetime, timezone


def _get_redis_client():
    url = os.environ.get("REDIS_URL")
    if url:
        return redis_lib.from_url(url, decode_responses=True)

    return redis_lib.Redis(
        host=os.environ["REDIS_HOST"],
        port=int(os.environ.get("REDIS_PORT", 6379)),
        password=os.environ.get("REDIS_PASSWORD"),
        decode_responses=True,
    )


_redis = _get_redis_client()


def _minute_stamp() -> str:
    """Returns the current UTC minute as YYYY-MM-DD-HH-MM."""
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d-%H-%M")


class AdminCallbackHandler(litellm.integrations.custom_logger.CustomLogger):
    """
    Fired after every successful LiteLLM completion.
    Increments per-user TPM and RPM counters in Redis.
    """

    def log_success_event(self, kwargs, response_obj, start_time, end_time):
        """Synchronous success hook — called for non-streaming completions."""
        try:
            self._record_usage(kwargs, response_obj)
        except Exception as e:
            print(f"[AdminCallbackHandler] log_success_event error: {e}")

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        """Async success hook — called for streaming completions."""
        try:
            self._record_usage(kwargs, response_obj)
        except Exception as e:
            print(f"[AdminCallbackHandler] async_log_success_event error: {e}")

    def _record_usage(self, kwargs: dict, response_obj):
        # LiteLLM passes client_id through the optional_params dict
        optional = kwargs.get("optional_params") or {}
        user_id  = optional.get("client_id") or kwargs.get("client_id")

        if not user_id:
            # No user_id means we can't attribute usage — skip silently
            return

        # Extract token usage from the response
        usage  = getattr(response_obj, "usage", None)
        tokens = 0
        if usage:
            # total_tokens is preferred; fall back to sum of prompt + completion
            tokens = getattr(usage, "total_tokens", None)
            if tokens is None:
                tokens = (
                    getattr(usage, "prompt_tokens",     0) +
                    getattr(usage, "completion_tokens", 0)
                )

        stamp   = _minute_stamp()
        tpm_key = f"usage:tpm:{user_id}:{stamp}"
        rpm_key = f"usage:rpm:{user_id}:{stamp}"

        # Use a pipeline so both increments hit Redis in one round-trip
        pipe = _redis.pipeline()
        pipe.incrby(tpm_key, int(tokens))
        pipe.incr(rpm_key)
        # TTL of 120s — 1 full minute of buffer past the current minute boundary
        pipe.expire(tpm_key, 120)
        pipe.expire(rpm_key, 120)
        pipe.execute()