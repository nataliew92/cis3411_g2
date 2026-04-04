import { classifyImage } from './homepage_model.js';


const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=30&data_restrict=descriptive_only";
const imageUrl = "https://framemark.vam.ac.uk/collections";
const main = document.getElementById('homepage');
const cacheKey = "va_cluster_cache";
const filterOptions = document.getElementById('filter-options');
const filterSearch = document.getElementById('filter-search');

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

const clusterLabels = [
    'a toy vehicle or mechanical toy',
    'a doll',
    'a soft toy or teddy bear',
    'an action figure or toy soldier',
    'a game or puzzle',
    'a dolls house or miniature room',
    'doll clothing or doll accessories'
];

const materialFilterLabels = [
    'a plastic toy',
    'a wooden toy',
    'a metal toy',
    'a fabric or cloth toy',
    'a paper toy',
    'a ceramic or porcelain toy'
];

const clusterDisplayNames = {
    'a toy vehicle or mechanical toy': 'Vehicles',
    'a doll': 'Dolls',
    'a soft toy or teddy bear': 'Soft Toys',
    'an action figure or toy soldier': 'Action Figures',
    'a game or puzzle': 'Games & Puzzles',
    'a dolls house or miniature room': "Dolls' Houses",
    'doll clothing or doll accessories': 'Doll Accessories'
};

const materialDisplayNames = {
    'a plastic toy': 'Plastic',
    'a wooden toy': 'Wood',
    'a metal toy': 'Metal',
    'a fabric or cloth toy': 'Fabric',
    'a paper toy': 'Paper',
    'a ceramic or porcelain toy': 'Ceramic'
};

let activeMode = null;
let activeCluster = null;
let activeMaterial = null;
let searchText = '';
let currentObjectList = [];
let cardMap = {};

async function fetchData() {
    let allObjects = [];
    let page = 1;
    while (page < 2) {
        const URL = apiBase + '&page=' + page;
        try {
            const response = await fetch(URL);
            const jsonData = await response.json();
            if (jsonData.records == null) {
                return [];
            }
            allObjects.push(jsonData.records);
            page += 1;
        } catch (error) {
            return [];
        }
    }
    return allObjects.flat();
}

function buildObjectList(records) {
    let objectList = [];
    for (let i = 0; i < records.length; i++) {
        let record = records[i];

        let title = '';
        if (record._primaryTitle && record.objectType) {
            title = record._primaryTitle + ' (' + record.objectType + ')';
        } else if (record.objectType) {
            title = record.objectType;
        } else {
            title = 'Untitled';
        }

        let makerName = '';
        if (record._primaryMaker) {
            makerName = record._primaryMaker.name;
        }

        let obj = {
            systemNumber: record.systemNumber,
            objectType: record.objectType,
            title: title,
            imageId: record._primaryImageId,
            date: record._primaryDate,
            place: record._primaryPlace,
            maker: makerName,
            specificLabel: null,
            cluster: null,
            material: null
        };

        objectList.push(obj);
    }
    return objectList;
}

function getFilteredList(objectList) {
    let filtered = [];
    for (let i = 0; i < objectList.length; i++) {
        let obj = objectList[i];
        let matchesCluster = activeCluster == null || obj.cluster == activeCluster;
        let matchesMaterial = activeMaterial == null || obj.material == activeMaterial;
        let matchesSearch = searchText == '' || (obj.specificLabel != null && obj.specificLabel.indexOf(searchText) != -1);
        if (matchesCluster && matchesMaterial && matchesSearch) {
            filtered.push(obj);
        }
    }
    return filtered;
}

function renderFilterButtons(mode) {
    filterOptions.innerHTML = '';
    activeMode = mode;

    let labels = mode == 'category' ? clusterLabels : materialFilterLabels;
    let displayNames = mode == 'category' ? clusterDisplayNames : materialDisplayNames;

    for (let i = 0; i < labels.length; i++) {
        let btn = document.createElement('button');
        btn.textContent = displayNames[labels[i]];
        btn.dataset.value = labels[i];

        btn.setAttribute('aria-pressed', 'false');

        let label = labels[i];
        btn.addEventListener('click', function() {
            if (mode == 'category') {
                if (activeCluster == label) {
                    activeCluster = null;
                } else {
                    activeCluster = label;
                }
            } else {
                if (activeMaterial == label) {
                    activeMaterial = null;
                } else {
                    activeMaterial = label;
                }
            }
            let allBtns = filterOptions.querySelectorAll('button');
            for (let j = 0; j < allBtns.length; j++) {
                let val = allBtns[j].dataset.value;
                let isActive = (mode == 'category' && val == activeCluster) || (mode == 'material' && val == activeMaterial);
                allBtns[j].setAttribute('aria-pressed', isActive ? 'true' : 'false');
            }
            renderCards(getFilteredList(currentObjectList));
        });

        filterOptions.appendChild(btn);
    }
}

function updateResultsStatus(count) {
    let status = document.getElementById('results-status');
    if (status != null) {
        status.textContent = count + ' objects shown';
    }
}

function setupFilters() {
    let btnCategory = document.getElementById('btn-category');
    let btnMaterial = document.getElementById('btn-material');

    btnCategory.addEventListener('click', function() {
        btnCategory.setAttribute('aria-pressed', 'true');
        btnMaterial.setAttribute('aria-pressed', 'false');
        filterOptions.setAttribute('aria-label', 'Category filters');
        renderFilterButtons('category');
    });

    btnMaterial.addEventListener('click', function() {
        btnMaterial.setAttribute('aria-pressed', 'true');
        btnCategory.setAttribute('aria-pressed', 'false');
        filterOptions.setAttribute('aria-label', 'Material filters');
        renderFilterButtons('material');
    });

    filterSearch.addEventListener('input', function() {
        searchText = filterSearch.value.toLowerCase();
        renderCards(getFilteredList(currentObjectList));
    });
}

function mapSpecificToCluster(specificLabel) {
    let vehicleLabels = ["a toy car", "a toy plane", "a toy train", "a toy boat", "a toy truck", "a toy tractor", "a clockwork toy", "a pull-along toy", "a ride-on toy"];
    let dollLabels = ["a doll", "a baby doll", "a fashion doll", "a paper doll", "a porcelain doll", "a rag doll"];
    let softToyLabels = ["a teddy bear", "a soft toy", "a stuffed animal"];
    let actionFigureLabels = ["an action figure", "a toy soldier", "a character toy"];
    let gameLabels = ["a board game", "a jigsaw puzzle", "a card game"];
    let dollsHouseLabels = ["a dolls house", "a miniature room", "dolls house furniture"];
    let accessoryLabels = ["doll clothing", "doll accessories"];

    if (vehicleLabels.indexOf(specificLabel) != -1) { return 'a toy vehicle or mechanical toy'; }
    if (dollLabels.indexOf(specificLabel) != -1) { return 'a doll'; }
    if (softToyLabels.indexOf(specificLabel) != -1) { return 'a soft toy or teddy bear'; }
    if (actionFigureLabels.indexOf(specificLabel) != -1) { return 'an action figure or toy soldier'; }
    if (gameLabels.indexOf(specificLabel) != -1) { return 'a game or puzzle'; }
    if (dollsHouseLabels.indexOf(specificLabel) != -1) { return 'a dolls house or miniature room'; }
    if (accessoryLabels.indexOf(specificLabel) != -1) { return 'doll clothing or doll accessories'; }
    return 'a toy';
}

function mapObjectTypeToCluster(objectType) {
    if (objectType == null) {
        return 'a toy';
    }
    let type = objectType.toLowerCase();

    if (type.indexOf('house') != -1) {
        return 'a dolls house or miniature room';
    }
    if (type.indexOf('clothing') != -1 || type.indexOf('accessor') != -1) {
        return 'doll clothing or doll accessories';
    }
    if (type.indexOf('doll') != -1 || type.indexOf('bisque') != -1) {
        return 'a doll';
    }
    if (type.indexOf('teddy') != -1 || type.indexOf('soft toy') != -1) {
        return 'a soft toy or teddy bear';
    }
    if (type.indexOf('soldier') != -1 || type.indexOf('action figure') != -1 || type == 'figure') {
        return 'an action figure or toy soldier';
    }
    if (type.indexOf('car') != -1 || type.indexOf('vehicle') != -1 || type.indexOf('pull-along') != -1 || type.indexOf('clockwork') != -1 || type.indexOf('mechanical') != -1) {
        return 'a toy vehicle or mechanical toy';
    }
    if (type.indexOf('puzzle') != -1 || type.indexOf('game') != -1) {
        return 'a game or puzzle';
    }
    return 'a toy';
}

function applyObjectTypeMapping(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        objectList[i].cluster = mapObjectTypeToCluster(objectList[i].objectType);
    }
}

function loadCache() {
    let stored = localStorage.getItem(cacheKey);
    if (stored == null) {
        return null;
    }
    return JSON.parse(stored);
}

function saveCache(objectList) {
    let cache = {};
    for (let i = 0; i < objectList.length; i++) {
        cache[objectList[i].systemNumber] = {
            specificLabel: objectList[i].specificLabel,
            cluster: objectList[i].cluster,
            material: objectList[i].material
        };
    }
    localStorage.setItem(cacheKey, JSON.stringify(cache));
}

function applyCache(objectList, cache) {
    for (let i = 0; i < objectList.length; i++) {
        let cached = cache[objectList[i].systemNumber];
        if (cached) {
            objectList[i].specificLabel = cached.specificLabel;
            objectList[i].cluster = cached.cluster;
            objectList[i].material = cached.material;
        }
    }
}

function isMaterialCached(cache) {
    for (let key in cache) {
        if (cache[key].material != null) {
            return true;
        }
    }
    return false;
}

async function classifyAll(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        let imgSrc = imageUrl + "/" + objectList[i].imageId + "/full/!400,400/0/default.jpg";
        try {
            let result = await classifyImage(imgSrc, specificTypeLabels, materialLabels);
            objectList[i].specificLabel = result.specificLabel;
            objectList[i].cluster = mapSpecificToCluster(result.specificLabel);
            objectList[i].material = result.material;
        } catch (error) {
            console.error('Classification error:', error);
        }
        console.log(
            (i + 1) + ' / ' + objectList.length + ' | ' +
            'API: ' + objectList[i].objectType + ' | ' +
            'AI: ' + objectList[i].specificLabel + ' | ' +
            'Cluster: ' + objectList[i].cluster + ' | ' +
            'Material: ' + objectList[i].material
        );
    }
}

function createCard(obj) {
    const card = document.createElement('article');
    card.setAttribute('aria-label', obj.title);
    card.dataset.id = obj.systemNumber;
    const imgSrc = imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg";
    card.innerHTML =
        '<h2>' + obj.title + '</h2>' +
        '<picture>' +
            '<img src="' + imgSrc + '" alt="" width="400" height="400" loading="lazy">' +
        '</picture>' +
        '<p></p>';
    return card;
}

function renderCards(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        if (cardMap[objectList[i].systemNumber] == null) {
            cardMap[objectList[i].systemNumber] = createCard(objectList[i]);
        }
    }

    while (main.firstChild) {
        main.removeChild(main.firstChild);
    }

    for (let i = 0; i < objectList.length; i++) {
        let obj = objectList[i];
        let card = cardMap[obj.systemNumber];
        let p = card.querySelector('p');
        if (p != null) {
            p.textContent = obj.cluster || '';
        }
        main.appendChild(card);
    }

    updateResultsStatus(objectList.length);
}

async function displayObjects() {
    const records = await fetchData();
    const objectList = buildObjectList(records);

    currentObjectList = objectList;
    setupFilters();

    /* TESTING: cache disabled — re-enable for production
    const cache = loadCache();
    if (cache != null) {
        console.log('Using cached labels');
        applyCache(objectList, cache);
        renderCards(getFilteredList(currentObjectList));
    } else { */
        applyObjectTypeMapping(objectList);
        renderCards(getFilteredList(currentObjectList));
        let startTime = Date.now();
        console.log('Running AI classification in background... ' + new Date().toLocaleTimeString());
        await classifyAll(objectList);
        let elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        renderCards(getFilteredList(currentObjectList));
        saveCache(objectList);
        console.log('All done — results cached. Time taken: ' + elapsed + 's');
    /* } */
}

displayObjects();
