from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FinMate AI"
    MONGODB_URL: str = "mongodb+srv://meetkikani27072006_db_user:nbgmqlJhRcidMm54@cluster0.44biaa3.mongodb.net" 
    DATABASE_NAME: str = "finmate_ai"
    SECRET_KEY: str = "SUPER_SECRET_KEY_REPLACE_ME_IN_PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
