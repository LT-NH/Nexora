"""Nexora - Field-level encryption utilities.

Uses Fernet (AES-128-CBC + HMAC) for transparent encryption/decryption
of sensitive fields such as store credentials.  The encryption key is
derived from a 256-bit master key stored in Settings.ENCRYPTION_KEY.
"""

import base64
import os

from cryptography.fernet import Fernet


# ── Key management ──────────────────────────────────────────────────

def _derive_fernet_key(raw_key: str) -> bytes:
    """Derive a 32-byte Fernet-compatible key from the raw ENCRYPTION_KEY.

    Fernet requires 32 url-safe-base64-decoded bytes.  We accept both:
      - A raw hex string (at least 64 hex chars → 32 bytes)
      - A valid Fernet key (44 url-safe-base64 chars)
    """
    raw = raw_key.strip()
    if len(raw) == 44:
        # Looks like a pre-encoded Fernet key
        try:
            base64.urlsafe_b64decode(raw + "==")
            return raw.encode("ascii")
        except Exception:
            pass
    # Hex-encoded raw key
    try:
        raw_bytes = bytes.fromhex(raw)
        if len(raw_bytes) >= 32:
            return base64.urlsafe_b64encode(raw_bytes[:32])
    except ValueError:
        pass
    # Fallback: derive from the raw string via SHA256 → hex → Fernet
    import hashlib
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return base64.urlsafe_b64encode(bytes.fromhex(digest[:64]))


# ── Public API ───────────────────────────────────────────────────────

def encrypt_value(plain: str, fernet: Fernet) -> str:
    """Encrypt *plain* and return the base64-encoded ciphertext."""
    return fernet.encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_value(cipher: str | None, fernet: Fernet) -> str | None:
    """Decrypt *cipher* back to plaintext, or return None if empty.

    If decryption fails (e.g. due to a key mismatch or data corruption),
    a ``ValueError`` is raised. Silently returning the ciphertext as
    plaintext would leak encrypted material and mask integrity problems,
    so failures must surface explicitly.
    """
    if not cipher:
        return None
    try:
        return fernet.decrypt(cipher.encode("ascii")).decode("utf-8")
    except Exception:
        # Never return ciphertext as plaintext — that would silently
        # expose encrypted material and hide key mismatches / corruption.
        raise ValueError(
            "Decryption failed: possible key mismatch or data corruption"
        )


def make_fernet(encryption_key: str) -> Fernet:
    """Build a Fernet instance from the configured ENCRYPTION_KEY."""
    return Fernet(_derive_fernet_key(encryption_key))
