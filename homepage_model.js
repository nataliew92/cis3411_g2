import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

let detector = null;

async function loadDetector() {
    if (detector == null) {
        detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", { dtype: "q8" });
    }
    return detector;
}

async function classifyImage(imageUrl, typeLabels, materialLabels) {
    const pipe = await loadDetector();
    const allLabels = typeLabels.concat(materialLabels);

    // Very low threshold so every label gets a score back
    const results = await pipe(imageUrl, allLabels, { threshold: 0.01, top_k: allLabels.length });

    // For each label, keep only its highest score across all detections
    var labelScores = {};
    for (var i = 0; i < results.length; i++) {
        var label = results[i].label;
        var score = results[i].score;
        if (labelScores[label] == null || score > labelScores[label]) {
            labelScores[label] = score;
        }
    }

    // Pick the type label with the highest score
    var topTypeLabel = typeLabels[0];
    var topTypeScore = -1;
    for (var i = 0; i < typeLabels.length; i++) {
        var s = labelScores[typeLabels[i]] || 0;
        if (s > topTypeScore) {
            topTypeScore = s;
            topTypeLabel = typeLabels[i];
        }
    }

    // Pick the material label with the highest score
    var topMaterialLabel = materialLabels[0];
    var topMaterialScore = -1;
    for (var i = 0; i < materialLabels.length; i++) {
        var s = labelScores[materialLabels[i]] || 0;
        if (s > topMaterialScore) {
            topMaterialScore = s;
            topMaterialLabel = materialLabels[i];
        }
    }

    return { specificLabel: topTypeLabel, material: topMaterialLabel };
}

async function detectObjects(imageUrl, labels) {
    const pipe = await loadDetector();
    return await pipe(imageUrl, labels);
}

export { classifyImage, detectObjects };
