import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";

const typeLabels = [
    "a doll",
    "a soft toy or teddy bear",
    "an action figure or toy soldier",
    "a toy vehicle or mechanical toy",
    "a game or puzzle",
    "a dolls house or miniature room",
    "doll clothing or doll accessories"
];

const materialLabels = [
    "a plastic toy",
    "a wooden toy",
    "a metal toy",
    "a fabric or cloth toy",
    "a paper toy",
    "a ceramic or porcelain toy"
];

let detector = null;

async function loadDetector() {
    if (detector == null) {
        detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32");
    }
    return detector;
}

async function classifyImageType(imageUrl) {
    const pipe = await loadDetector();
    const results = await pipe(imageUrl, typeLabels);
    let topScore = -1;
    let topLabel = typeLabels[0];
    for (let i = 0; i < results.length; i++) {
        if (results[i].score > topScore) {
            topScore = results[i].score;
            topLabel = results[i].label;
        }
    }
    return topLabel;
}

async function classifyImageMaterial(imageUrl) {
    const pipe = await loadDetector();
    const results = await pipe(imageUrl, materialLabels);
    let topScore = -1;
    let topLabel = materialLabels[0];
    for (let i = 0; i < results.length; i++) {
        if (results[i].score > topScore) {
            topScore = results[i].score;
            topLabel = results[i].label;
        }
    }
    return topLabel;
}

async function detectObjects(imageUrl, labels) {
    const pipe = await loadDetector();
    return await pipe(imageUrl, labels);
}

export { classifyImageType, classifyImageMaterial, detectObjects };
