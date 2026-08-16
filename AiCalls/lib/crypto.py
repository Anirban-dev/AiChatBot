# lib/crypto.py
"""AES-256-GCM encryption helpers shared with the Node backend.

Mirrors `Backend/src/utils/crypto.ts`:
  - key derived (sha256) from the ENCRYPTION_KEY env (falls back to a fixed dev
    secret so local dev works without extra config)
  - ciphertext format: enc:v1:<iv_b64>:<tag_b64>:<ct_b64>  (base64, ':' delimited)

The encryption key is derived lazily on first use — not at import time — so
that config.py's load_dotenv() (which runs during app boot) has already
populated ENCRYPTION_KEY by the time any encrypt/decrypt actually happens.
"""

import os
import hashlib
import base64
import threading

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_PREFIX = "enc:v1:"
_LOCK = threading.Lock()
_KEY_CACHE: bytes | None = None


def _derive_key() -> bytes:
    global _KEY_CACHE
    if _KEY_CACHE is None:
        with _LOCK:
            if _KEY_CACHE is None:
                secret = os.getenv("ENCRYPTION_KEY")
                _KEY_CACHE = hashlib.sha256(secret.encode("utf-8")).digest()
    return _KEY_CACHE


def encrypt(plain: str) -> str:
    if not plain:
        return ""
    if plain.startswith(_PREFIX):
        return plain
    iv = os.urandom(12)
    # AESGCM.encrypt returns ciphertext with the 16-byte auth tag APPENDED
    # (ciphertext + tag). We store them separately to match the Node backend.
    combined = AESGCM(_derive_key()).encrypt(iv, plain.encode("utf-8"), None)
    ct = combined[:-16]
    tag = combined[-16:]
    return (
        f"{_PREFIX}"
        f"{base64.b64encode(iv).decode()}:"
        f"{base64.b64encode(tag).decode()}:"
        f"{base64.b64encode(ct).decode()}"
    )


def decrypt(value: str | None) -> str | None:
    """Decrypt an enc:v1: value.

    Returns None if it cannot be decrypted. Values NOT in the encrypted format
    are returned unchanged (legacy plaintext rows still work).
    """
    if not value:
        return None
    if not value.startswith(_PREFIX):
        return value
    try:
        rest = value[len(_PREFIX):]
        iv_b64, tag_b64, ct_b64 = rest.split(":")
        iv = base64.b64decode(iv_b64)
        tag = base64.b64decode(tag_b64)
        ct = base64.b64decode(ct_b64)
        # AESGCM.decrypt expects tag appended: ciphertext + tag
        combined = ct + tag
        plain = AESGCM(_derive_key()).decrypt(iv, combined, None)
        return plain.decode("utf-8")
    except Exception:
        return None
