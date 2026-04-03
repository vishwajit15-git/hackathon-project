from fastapi import FastAPI

app = FastAPI(title="Crowd ML Stub Service")


@app.post("/detect-crowd")
async def detect_crowd():
    return {"detectedCount": 250, "confidence": 0.87, "anomalyDetected": False, "mock": True}


@app.post("/check-collision")
async def check_collision():
    return {"riskScore": 0.2, "confidence": 0.9, "mock": True}


@app.post("/find-missing")
async def find_missing():
    return {"found": False, "confidence": 0.0, "mock": True}


@app.post("/predict")
async def predict():
    return {"predictions": [], "note": "ML stub active", "mock": True}
