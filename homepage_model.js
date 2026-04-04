import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";

let classifier = null;
let detector = null;

async function loadClassifier() {
    if (classifier == null) {
        classifier = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32");
    }
    return classifier;
}

async function loadDetector() {
    if (detector == null) {
        detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", { dtype: "q8" });
    }
    return detector;
}

async function classifyImage(imageUrl, typeLabels, materialLabels) {
    const pipe = await loadClassifier();
    const allLabels = typeLabels.concat(materialLabels);
    const results = await pipe(imageUrl, allLabels);

    let topTypeLabel = typeLabels[0];
    let topMaterialLabel = materialLabels[0];
    let typeFound = false;
    let materialFound = false;

    for (let i = 0; i < results.length; i++) {
        let label = results[i].label;
        if (typeFound == false && typeLabels.indexOf(label) != -1) {
            topTypeLabel = label;
            typeFound = true;
        }
        if (materialFound == false && materialLabels.indexOf(label) != -1) {
            topMaterialLabel = label;
            materialFound = true;
        }
        if (typeFound && materialFound) {
            break;
        }
    }

    return { specificLabel: topTypeLabel, material: topMaterialLabel };
}

async function detectObjects(imageUrl, labels) {
    const pipe = await loadDetector();
    return await pipe(imageUrl, labels);
}

export { classifyImage, detectObjects };
