import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

const specificTypeLabels = [
    "a toy car",
    "a toy plane",
    "a toy train",
    "a toy boat",
    "a toy truck",
    "a toy tractor",
    "a clockwork toy",
    "a pull-along toy",
    "a ride-on toy",
    "a doll",
    "a baby doll",
    "a fashion doll",
    "a paper doll",
    "a porcelain doll",
    "a rag doll",
    "a teddy bear",
    "a soft toy",
    "a stuffed animal",
    "an action figure",
    "a toy soldier",
    "a character toy",
    "a board game",
    "a jigsaw puzzle",
    "a card game",
    "a dolls house",
    "a miniature room",
    "dolls house furniture",
    "doll clothing",
    "doll accessories"
];

const materialLabels = [
    "a plastic toy",
    "a wooden toy",
    "a metal toy",
    "a fabric or cloth toy",
    "a paper toy",
    "a ceramic or porcelain toy"
];

const allLabels = specificTypeLabels.concat(materialLabels);

let detector = null;

async function loadDetector() {
    if (detector == null) {
        detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", { dtype: "q8" });
    }
    return detector;
}

async function classifyImage(imageUrl) {
    const pipe = await loadDetector();
    const results = await pipe(imageUrl, allLabels);

    let topTypeScore = -1;
    let topTypeLabel = specificTypeLabels[0];
    let topMaterialScore = -1;
    let topMaterialLabel = materialLabels[0];

    for (let i = 0; i < results.length; i++) {
        let label = results[i].label;
        let score = results[i].score;

        if (specificTypeLabels.indexOf(label) != -1) {
            if (score > topTypeScore) {
                topTypeScore = score;
                topTypeLabel = label;
            }
        }
        if (materialLabels.indexOf(label) != -1) {
            if (score > topMaterialScore) {
                topMaterialScore = score;
                topMaterialLabel = label;
            }
        }
    }

    return { specificLabel: topTypeLabel, material: topMaterialLabel };
}

async function detectObjects(imageUrl, labels) {
    const pipe = await loadDetector();
    return await pipe(imageUrl, labels);
}

export { classifyImage, detectObjects };
