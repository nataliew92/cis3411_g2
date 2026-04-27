import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

let detector = null;

async function loadDetector(progressCallback) {
    if (detector == null) {
        detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", {
            progress_callback: progressCallback
        });
    }
    return detector;
}

async function classifyImage(imageUrl, typeLabels, materialLabels, progressCallback) {
    const pipe = await loadDetector(progressCallback);

    // Pass 1: type labels only — no competition from material labels
    const typeResults = await pipe(imageUrl, typeLabels, { threshold: 0.01, top_k: typeLabels.length });
    var typeScores = {};
    for (var i = 0; i < typeResults.length; i++) {
        var label = typeResults[i].label;
        var score = typeResults[i].score;
        typeScores[label] = (typeScores[label] || 0) + score;
    }

    // Pass 2: material labels only
    var matResults = await pipe(imageUrl, materialLabels, { threshold: 0.01, top_k: materialLabels.length });
    var matScores = {};
    for (var i = 0; i < matResults.length; i++) {
        var label = matResults[i].label;
        var score = matResults[i].score;
        matScores[label] = (matScores[label] || 0) + score;
    }

    // Pick the top two type labels by accumulated score
    var topTypeLabel = typeLabels[0], topTypeScore = -1, secondTypeLabel = null, secondTypeScore = -1;
    for (var i = 0; i < typeLabels.length; i++) {
        var s = typeScores[typeLabels[i]] || 0;
        if (s > topTypeScore) { secondTypeLabel = topTypeLabel; secondTypeScore = topTypeScore; topTypeScore = s; topTypeLabel = typeLabels[i]; }
        else if (s > secondTypeScore) { secondTypeScore = s; secondTypeLabel = typeLabels[i]; }
    }

    // Pick the material label with the highest accumulated score
    var topMaterialLabel = materialLabels[0], topMaterialScore = -1;
    for (var i = 0; i < materialLabels.length; i++) {
        var s = matScores[materialLabels[i]] || 0;
        if (s > topMaterialScore) { topMaterialScore = s; topMaterialLabel = materialLabels[i]; }
    }

    return { specificLabel: topTypeLabel, material: topMaterialLabel, typeScore: topTypeScore, materialScore: topMaterialScore, secondLabel: secondTypeLabel, secondScore: secondTypeScore };
}

async function detectObjects(imageUrl, labels) {
    const pipe = await loadDetector();
    return await pipe(imageUrl, labels);
}

export { classifyImage, detectObjects };
