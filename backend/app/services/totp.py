import pyotp
import qrcode
import io
import base64
from app.models.user import User


def generate_totp_secret(user: User) -> str:
    if not user.totp_secret:
        user.totp_secret = pyotp.random_base32()
    return user.totp_secret


def get_totp_uri(user: User) -> str:
    secret = generate_totp_secret(user)
    return pyotp.totp.TOTP(secret).provisioning_uri(user.email, issuer_name="Nexora")


def verify_totp(user: User, code: str) -> bool:
    if not user.totp_secret:
        return False
    totp = pyotp.TOTP(user.totp_secret)
    return totp.verify(code)


def generate_qr_code(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()
