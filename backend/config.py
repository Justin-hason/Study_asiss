from sqlalchemy.engine import URL
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8000

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "knowledge"

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0

    JWT_SECRET_KEY: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    DEFAULT_MODEL_PROVIDER: str = "deepseek"
    DEFAULT_MODEL_ID: str = "deepseek-v4-pro"
    DEFAULT_MODEL_BASE_URL: str = "https://api.deepseek.com/v1"
    DEFAULT_MODEL_API_KEY: str = ""

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-v4-pro"

    # 联网搜索配置
    WEB_SEARCH_ENABLED: bool = True
    SEARCH_API_KEY: str = ""
    SEARCH_API_URL: str = "https://api.tavily.com/search"

    MILVUS_ADDR: str = "milvus:19530"
    ES_ADDR: str = "http://elasticsearch:9200"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()

DATABASE_URL = URL.create(
    "postgresql",
    username=settings.POSTGRES_USER,
    password=settings.POSTGRES_PASSWORD,
    host=settings.POSTGRES_HOST,
    port=settings.POSTGRES_PORT,
    database=settings.POSTGRES_DB,
)