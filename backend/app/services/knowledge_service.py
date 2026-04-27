"""Business logic for the Knowledge Base."""
import re
import unicodedata
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload

from app.models.db_models import KBArticle, KBCategory, KBArticleVideo
from app.services import kb_storage


# ── Slug helpers ──────────────────────────────────────────────────────────


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9\s-]", "", value).strip().lower()
    value = re.sub(r"[\s_-]+", "-", value)
    return value or "item"


def unique_slug(db: Session, model, base: str, exclude_id: Optional[UUID] = None) -> str:
    slug = slugify(base)
    candidate = slug
    i = 2
    while True:
        q = db.query(model).filter(model.slug == candidate)
        if exclude_id:
            q = q.filter(model.id != exclude_id)
        if not db.query(q.exists()).scalar():
            return candidate
        candidate = f"{slug}-{i}"
        i += 1


# ── Serialization ─────────────────────────────────────────────────────────


def category_to_dict(cat: KBCategory, article_count: Optional[int] = None) -> dict:
    return {
        "id": str(cat.id),
        "name": cat.name,
        "slug": cat.slug,
        "icon": cat.icon,
        "description": cat.description,
        "order": cat.order,
        "article_count": article_count,
    }


def video_to_dict(v: KBArticleVideo, include_url: bool = True) -> dict:
    data = {
        "id": str(v.id),
        "title": v.title,
        "s3_key": v.s3_key,
        "content_type": v.content_type,
        "size_bytes": v.size_bytes,
        "duration_seconds": v.duration_seconds,
        "order": v.order,
    }
    if include_url:
        try:
            data["url"] = kb_storage.presigned_get(v.s3_key)
        except kb_storage.KBStorageError:
            data["url"] = None
    return data


def article_to_dict(article: KBArticle, include_content: bool = True, include_videos: bool = True) -> dict:
    out = {
        "id": str(article.id),
        "category_id": str(article.category_id),
        "category_slug": article.category.slug if article.category else None,
        "category_name": article.category.name if article.category else None,
        "category_icon": article.category.icon if article.category else None,
        "title": article.title,
        "slug": article.slug,
        "summary": article.summary,
        "order": article.order,
        "is_published": article.is_published,
        "created_at": article.created_at.isoformat() if article.created_at else None,
        "updated_at": article.updated_at.isoformat() if article.updated_at else None,
        "video_count": len(article.videos) if article.videos is not None else 0,
    }
    if include_content:
        out["content"] = article.content
    if include_videos:
        out["videos"] = [video_to_dict(v) for v in (article.videos or [])]
    return out


# ── Queries ───────────────────────────────────────────────────────────────


def list_categories(db: Session) -> list[dict]:
    cats = db.query(KBCategory).order_by(KBCategory.order, KBCategory.name).all()
    # article counts in a single query
    counts = dict(
        db.query(KBArticle.category_id, func.count(KBArticle.id))
          .filter(KBArticle.is_published == True)  # noqa: E712
          .group_by(KBArticle.category_id)
          .all()
    )
    return [category_to_dict(c, counts.get(c.id, 0)) for c in cats]


def list_articles(
    db: Session,
    *,
    category_slug: Optional[str] = None,
    q: Optional[str] = None,
    published_only: bool = True,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    query = db.query(KBArticle).options(joinedload(KBArticle.category), joinedload(KBArticle.videos))

    if published_only:
        query = query.filter(KBArticle.is_published == True)  # noqa: E712

    if category_slug:
        query = query.join(KBCategory).filter(KBCategory.slug == category_slug)

    if q:
        term = q.strip()
        if term:
            # Try FTS first; fallback to ILIKE if the user typed special chars
            try:
                query = query.filter(
                    text(
                        "to_tsvector('portuguese', coalesce(kb_articles.title,'') || ' ' "
                        "|| coalesce(kb_articles.summary,'') || ' ' "
                        "|| coalesce(kb_articles.content,'')) @@ plainto_tsquery('portuguese', :q)"
                    ).bindparams(q=term)
                )
            except Exception:
                like = f"%{term}%"
                query = query.filter(or_(KBArticle.title.ilike(like), KBArticle.content.ilike(like)))

    total = query.count()
    items = (
        query.order_by(KBArticle.order, KBArticle.title)
             .offset((page - 1) * page_size)
             .limit(page_size)
             .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [article_to_dict(a, include_content=False, include_videos=False) | {"video_count": len(a.videos)} for a in items],
    }


def get_article_by_slug(db: Session, slug: str, published_only: bool = True) -> Optional[KBArticle]:
    q = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.videos),
    ).filter(KBArticle.slug == slug)
    if published_only:
        q = q.filter(KBArticle.is_published == True)  # noqa: E712
    return q.first()
