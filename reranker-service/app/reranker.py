from sentence_transformers import CrossEncoder

_model = None

def get_model(model_name: str = "BAAI/bge-reranker-v2-m3"):
    global _model
    if _model is None:
        _model = CrossEncoder(model_name, trust_remote_code=True)
    return _model

def rerank(query: str, passages: list[str]) -> list[float]:
    model = get_model()
    pairs = [[query, passage] for passage in passages]
    scores = model.predict(pairs, show_progress_bar=False)
    if hasattr(scores, 'tolist'):
        return scores.tolist()
    return list(scores)
