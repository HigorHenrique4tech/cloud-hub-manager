"""Knowledge Base API.

Reading endpoints: any authenticated user.
Writing endpoints: platform admin only (User.is_admin).
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_admin, get_current_user
from app.database import get_db
from app.models.db_models import KBArticle, KBArticleVideo, KBCategory, User
from app.services import kb_storage, knowledge_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# ── Schemas ───────────────────────────────────────────────────────────────


class CategoryIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    icon: Optional[str] = Field(None, max_length=40)
    description: Optional[str] = None
    order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    icon: Optional[str] = Field(None, max_length=40)
    description: Optional[str] = None
    order: Optional[int] = None


class ArticleIn(BaseModel):
    category_id: UUID
    title: str = Field(..., min_length=1, max_length=200)
    summary: Optional[str] = Field(None, max_length=400)
    content: str = ""
    order: int = 0
    is_published: bool = True


class ArticleUpdate(BaseModel):
    category_id: Optional[UUID] = None
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    summary: Optional[str] = Field(None, max_length=400)
    content: Optional[str] = None
    order: Optional[int] = None
    is_published: Optional[bool] = None


class VideoPresignIn(BaseModel):
    filename: str = Field(..., min_length=1, max_length=200)
    content_type: str = Field(..., min_length=1, max_length=80)


class VideoConfirmIn(BaseModel):
    s3_key: str = Field(..., min_length=1, max_length=500)
    title: Optional[str] = Field(None, max_length=200)
    content_type: Optional[str] = Field(None, max_length=80)
    size_bytes: Optional[int] = None
    duration_seconds: Optional[int] = None
    order: int = 0


# ── Public (any authenticated user) ───────────────────────────────────────


@router.get("/categories")
def list_categories(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return knowledge_service.list_categories(db)


@router.get("/articles")
def list_articles(
    category_slug: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return knowledge_service.list_articles(
        db,
        category_slug=category_slug,
        q=q,
        published_only=True,
        page=page,
        page_size=page_size,
    )


@router.get("/articles/{slug}")
def get_article(
    slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    article = knowledge_service.get_article_by_slug(db, slug, published_only=not user.is_admin)
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")
    return knowledge_service.article_to_dict(article)


# ── Admin: categories ─────────────────────────────────────────────────────


@router.post("/admin/categories", status_code=201)
def create_category(
    payload: CategoryIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    slug = knowledge_service.unique_slug(db, KBCategory, payload.name)
    cat = KBCategory(
        name=payload.name,
        slug=slug,
        icon=payload.icon,
        description=payload.description,
        order=payload.order,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return knowledge_service.category_to_dict(cat, 0)


@router.patch("/admin/categories/{category_id}")
def update_category(
    category_id: UUID,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    cat = db.query(KBCategory).filter(KBCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")

    if payload.name is not None and payload.name != cat.name:
        cat.name = payload.name
        cat.slug = knowledge_service.unique_slug(db, KBCategory, payload.name, exclude_id=cat.id)
    if payload.icon is not None:
        cat.icon = payload.icon
    if payload.description is not None:
        cat.description = payload.description
    if payload.order is not None:
        cat.order = payload.order

    db.commit()
    db.refresh(cat)
    return knowledge_service.category_to_dict(cat)


@router.delete("/admin/categories/{category_id}", status_code=204)
def delete_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    cat = db.query(KBCategory).filter(KBCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    # delete videos from S3 before cascade
    video_keys = [
        v.s3_key
        for a in cat.articles
        for v in a.videos
    ]
    db.delete(cat)
    db.commit()
    for key in video_keys:
        try:
            kb_storage.delete_object(key)
        except kb_storage.KBStorageError:
            pass


# ── Admin: articles ───────────────────────────────────────────────────────


@router.get("/admin/articles")
def admin_list_articles(
    category_slug: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    return knowledge_service.list_articles(
        db,
        category_slug=category_slug,
        q=q,
        published_only=False,
        page=page,
        page_size=page_size,
    )


@router.post("/admin/articles", status_code=201)
def create_article(
    payload: ArticleIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    cat = db.query(KBCategory).filter(KBCategory.id == payload.category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")

    slug = knowledge_service.unique_slug(db, KBArticle, payload.title)
    article = KBArticle(
        category_id=payload.category_id,
        title=payload.title,
        slug=slug,
        summary=payload.summary,
        content=payload.content or "",
        order=payload.order,
        is_published=payload.is_published,
        created_by_id=admin.id,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    # reload with relationships
    article = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.videos),
    ).filter(KBArticle.id == article.id).first()
    return knowledge_service.article_to_dict(article)


@router.patch("/admin/articles/{article_id}")
def update_article(
    article_id: UUID,
    payload: ArticleUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    if payload.category_id is not None:
        if not db.query(KBCategory).filter(KBCategory.id == payload.category_id).first():
            raise HTTPException(status_code=404, detail="Categoria não encontrada")
        article.category_id = payload.category_id
    if payload.title is not None and payload.title != article.title:
        article.title = payload.title
        article.slug = knowledge_service.unique_slug(db, KBArticle, payload.title, exclude_id=article.id)
    if payload.summary is not None:
        article.summary = payload.summary
    if payload.content is not None:
        article.content = payload.content
    if payload.order is not None:
        article.order = payload.order
    if payload.is_published is not None:
        article.is_published = payload.is_published

    db.commit()
    db.refresh(article)
    article = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.videos),
    ).filter(KBArticle.id == article.id).first()
    return knowledge_service.article_to_dict(article)


@router.delete("/admin/articles/{article_id}", status_code=204)
def delete_article(
    article_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")
    video_keys = [v.s3_key for v in article.videos]
    db.delete(article)
    db.commit()
    for key in video_keys:
        try:
            kb_storage.delete_object(key)
        except kb_storage.KBStorageError:
            pass


# ── Admin: videos ─────────────────────────────────────────────────────────


@router.get("/admin/storage/status")
def storage_status(_admin: User = Depends(get_current_admin)):
    return {
        "configured": kb_storage.is_configured(),
        "allowed_types": sorted(kb_storage.ALLOWED_CONTENT_TYPES),
        "max_upload_mb": __import__("app.core.config", fromlist=["settings"]).settings.KB_UPLOAD_MAX_MB,
    }


@router.post("/admin/articles/{article_id}/videos/presign")
def presign_video_upload(
    article_id: UUID,
    payload: VideoPresignIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")
    if payload.content_type not in kb_storage.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Formato de vídeo não permitido")

    s3_key = kb_storage.build_key(str(article_id), payload.filename)
    try:
        upload_url = kb_storage.presigned_put(s3_key, payload.content_type)
    except kb_storage.KBStorageError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"upload_url": upload_url, "s3_key": s3_key}


@router.post("/admin/articles/{article_id}/videos", status_code=201)
def confirm_video_upload(
    article_id: UUID,
    payload: VideoConfirmIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    video = KBArticleVideo(
        article_id=article_id,
        title=payload.title,
        s3_key=payload.s3_key,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        duration_seconds=payload.duration_seconds,
        order=payload.order,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return knowledge_service.video_to_dict(video)


@router.delete("/admin/articles/{article_id}/videos/{video_id}", status_code=204)
def delete_video(
    article_id: UUID,
    video_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    video = db.query(KBArticleVideo).filter(
        KBArticleVideo.id == video_id,
        KBArticleVideo.article_id == article_id,
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    s3_key = video.s3_key
    db.delete(video)
    db.commit()
    try:
        kb_storage.delete_object(s3_key)
    except kb_storage.KBStorageError:
        pass
