# main.py
# Install dependencies:
#   pip install fastapi uvicorn transformers torch pillow requests
# Run with:
#   uvicorn main:app --reload

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from PIL import Image
import torch
from transformers import OwlViTProcessor, OwlViTForObjectDetection
import io

app = FastAPI()

# Allow your HTML file to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock to your domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading OWL-ViT model...")
processor = OwlViTProcessor.from_pretrained("google/owlvit-base-patch32")
model = OwlViTForObjectDetection.from_pretrained("google/owlvit-base-patch32")
model.eval()
print("Model ready.")


class DetectRequest(BaseModel):
    image_url: str
    queries: list[str]


@app.post("/detect")
def detect(req: DetectRequest):
    try:
        # Fetch the image from V&A
        response = requests.get(req.image_url, stream=True, timeout=10)
        response.raise_for_status()
        image = Image.open(io.BytesIO(response.content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load image: {e}")

    texts = [req.queries]
    inputs = processor(text=texts, images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)

    target_sizes = torch.Tensor([image.size[::-1]])
    results = processor.image_processor.post_process_object_detection(
        outputs=outputs,
        threshold=0.1,
        target_sizes=target_sizes
    )

    boxes = results[0]["boxes"]
    scores = results[0]["scores"]
    labels = results[0]["labels"]

    detections = []
    for box, score, label in zip(boxes, scores, labels):
        detections.append({
            "label": req.queries[label],
            "score": round(score.item(), 3),
            "box": [round(v, 2) for v in box.tolist()]  # [x_min, y_min, x_max, y_max]
        })

    # Sort by confidence descending
    detections.sort(key=lambda d: d["score"], reverse=True)

    return {
        "image_width": image.size[0],
        "image_height": image.size[1],
        "detections": detections
    }


@app.get("/")
def root():
    return {"status": "OWL-ViT backend is running"}
