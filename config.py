"""
환경 설정 파일
개발/운영 환경에 따른 설정을 관리합니다.
"""
import os
from datetime import timedelta

class Config:
    """기본 설정"""
    # Flask 기본 설정
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    DEBUG = False
    TESTING = False
    
    # 캐시 설정
    CACHE_TYPE = 'SimpleCache'
    CACHE_DEFAULT_TIMEOUT = 3600  # 1시간
    
    # API 설정
    API_RATE_LIMIT = "100/hour"  # Rate limiting
    API_TIMEOUT = 30  # API 요청 타임아웃 (초)
    
    # 보안 설정
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)
    
    # CORS 설정
    CORS_ORIGINS = ["*"]  # 운영에서는 특정 도메인으로 제한

class DevelopmentConfig(Config):
    """개발 환경 설정"""
    DEBUG = True
    SESSION_COOKIE_SECURE = False  # HTTP에서도 작동하도록
    CORS_ORIGINS = ["http://localhost:*", "http://127.0.0.1:*"]

class ProductionConfig(Config):
    """운영 환경 설정"""
    DEBUG = False
    # 운영 환경에서는 반드시 환경변수로 설정
    SECRET_KEY = os.environ.get('SECRET_KEY')
    
    # 캐시 성능 향상
    CACHE_TYPE = 'FileSystemCache'
    CACHE_DIR = '/tmp/flask_cache'
    
    # 보안 강화
    CORS_ORIGINS = [
        "https://yourdomain.com",
        "https://www.yourdomain.com"
    ]

class TestingConfig(Config):
    """테스트 환경 설정"""
    TESTING = True
    CACHE_TYPE = 'NullCache'  # 테스트시 캐시 비활성화

# 환경별 설정 매핑
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config():
    """현재 환경에 맞는 설정 반환"""
    env = os.environ.get('FLASK_ENV', 'development')
    return config.get(env, config['default'])