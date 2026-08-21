from pydantic import BaseModel


class Partner(BaseModel):
    partner_code: str
    name: str
    aliases: list[str] = []
    registration_no: str | None = None
