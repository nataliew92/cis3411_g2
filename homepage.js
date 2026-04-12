import { classifyImage } from './homepage_model.js';


const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=100&data_restrict=descriptive_only";
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
    "a soft character toy",
    "a character doll",
    "a plush toy",
    "a puppet",
    "a marionette",
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
    'a puppet or marionette',
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
    'a puppet or marionette': 'Puppets',
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

let groupingMode = 'category';
let activeGroup = null;
let searchText = '';
let currentObjectList = [];
let cardMap = {};
let cloudAreaEl = null;
let pendingEl = null;

async function fetchData() {
    let allObjects = [];
    let page = 1;
    while (page < 9) {
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


function renderFilterButtons(mode) {
    filterOptions.innerHTML = '';

    var labels = mode == 'category' ? clusterLabels : materialFilterLabels;
    var displayNames = mode == 'category' ? clusterDisplayNames : materialDisplayNames;

    for (var i = 0; i < labels.length; i++) {
        var btn = document.createElement('button');
        btn.textContent = displayNames[labels[i]];
        btn.dataset.value = labels[i];
        btn.setAttribute('aria-pressed', 'false');

        btn.addEventListener('click', function() {
            var key = this.dataset.value;
            scrollToCloud(key);
            var allBtns = filterOptions.querySelectorAll('button');
            for (var j = 0; j < allBtns.length; j++) {
                allBtns[j].setAttribute('aria-pressed', allBtns[j].dataset.value == activeGroup ? 'true' : 'false');
            }
        });

        filterOptions.appendChild(btn);
    }
}

function updateResultsStatus(message) {
    let status = document.getElementById('results-status');
    if (status != null) {
        status.textContent = message;
    }
}

function getGroupKeys() {
    if (groupingMode == 'category') { return clusterLabels; }
    return materialFilterLabels;
}

function getGroupDisplayName(key) {
    if (groupingMode == 'category') { return clusterDisplayNames[key] || key; }
    return materialDisplayNames[key] || key;
}

function getObjectGroupKey(obj) {
    if (groupingMode == 'category') { return obj.cluster; }
    return obj.material;
}

function repositionClouds() {
    var keys = getGroupKeys();
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';
    var containerWidth = cloudAreaEl.offsetWidth;
    var colGap = 24;

    var cols;
    if (containerWidth >= 1600) { cols = 5; }
    else if (containerWidth >= 1100) { cols = 4; }
    else if (containerWidth >= 700) { cols = 3; }
    else if (containerWidth >= 400) { cols = 2; }
    else { cols = 1; }

    var colWidth = Math.floor((containerWidth - (cols - 1) * colGap) / cols);
    var colTops = [];
    for (var c = 0; c < cols; c++) { colTops.push(0); }

    for (var i = 0; i < keys.length; i++) {
        var sec = cloudAreaEl.querySelector('section[' + dataAttr + '="' + keys[i] + '"]');
        if (sec == null) { continue; }
        var col = i % cols;
        sec.style.left = (col * (colWidth + colGap)) + 'px';
        sec.style.top = colTops[col] + 'px';
        sec.style.width = colWidth + 'px';
        colTops[col] += sec.offsetHeight + 40;
    }

    var maxBottom = 0;
    for (var c = 0; c < cols; c++) {
        if (colTops[c] > maxBottom) { maxBottom = colTops[c]; }
    }
    cloudAreaEl.style.minHeight = maxBottom + 'px';
}

function renderClouds() {
    var keys = getGroupKeys();
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';

    while (cloudAreaEl.firstChild) {
        cloudAreaEl.removeChild(cloudAreaEl.firstChild);
    }

    for (var i = 0; i < keys.length; i++) {
        var sec = document.createElement('section');
        sec.setAttribute(dataAttr, keys[i]);
        var heading = document.createElement('h2');
        heading.textContent = getGroupDisplayName(keys[i]);
        sec.appendChild(heading);
        cloudAreaEl.appendChild(sec);
    }

    for (var i = 0; i < currentObjectList.length; i++) {
        var obj = currentObjectList[i];
        var groupKey = getObjectGroupKey(obj);
        if (groupKey == null) { continue; }
        var sec = cloudAreaEl.querySelector('section[' + dataAttr + '="' + groupKey + '"]');
        if (sec == null) { continue; }
        var card = cardMap[obj.systemNumber];
        if (card == null) { continue; }
        var h2 = card.querySelector('h2');
        if (h2 != null) { h2.textContent = buildHoverText(obj); }
        sec.appendChild(card);
    }

    activeGroup = null;
    repositionClouds();
}

function scrollToCloud(key) {
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';
    var allSections = cloudAreaEl.querySelectorAll('section[' + dataAttr + ']');
    for (var i = 0; i < allSections.length; i++) {
        allSections[i].removeAttribute('data-active');
    }
    var target = cloudAreaEl.querySelector('section[' + dataAttr + '="' + key + '"]');
    if (target == null) { return; }
    if (activeGroup == key) {
        activeGroup = null;
        return;
    }
    activeGroup = key;
    target.setAttribute('data-active', 'true');
    target.scrollIntoView({ block: 'center', inline: 'center' });
}

function applySearch() {
    for (var i = 0; i < currentObjectList.length; i++) {
        var obj = currentObjectList[i];
        var card = cardMap[obj.systemNumber];
        if (card == null) { continue; }
        if (searchText == '') {
            card.style.display = '';
        } else {
            var matches = obj.specificLabel != null && obj.specificLabel.indexOf(searchText) != -1;
            card.style.display = matches ? '' : 'none';
        }
    }
}

function setupFilters() {
    var btnCategory = document.getElementById('btn-category');
    var btnMaterial = document.getElementById('btn-material');

    btnCategory.addEventListener('click', function() {
        btnCategory.setAttribute('aria-pressed', 'true');
        btnMaterial.setAttribute('aria-pressed', 'false');
        filterOptions.setAttribute('aria-label', 'Category filters');
        groupingMode = 'category';
        renderClouds();
        renderFilterButtons('category');
    });

    btnMaterial.addEventListener('click', function() {
        btnMaterial.setAttribute('aria-pressed', 'true');
        btnCategory.setAttribute('aria-pressed', 'false');
        filterOptions.setAttribute('aria-label', 'Material filters');
        groupingMode = 'material';
        renderClouds();
        renderFilterButtons('material');
    });

    filterSearch.addEventListener('input', function() {
        searchText = filterSearch.value.toLowerCase();
        applySearch();
    });

    renderFilterButtons('category');
}

function mapSpecificToCluster(specificLabel) {
    let vehicleLabels = ["a toy car", "a toy plane", "a toy train", "a toy boat", "a toy truck", "a toy tractor", "a clockwork toy", "a pull-along toy", "a ride-on toy"];
    let dollLabels = ["a doll", "a baby doll", "a fashion doll", "a paper doll", "a porcelain doll", "a rag doll", "a character doll"];
    let softToyLabels = ["a teddy bear", "a soft toy", "a stuffed animal", "a soft character toy", "a plush toy"];
    let actionFigureLabels = ["an action figure", "a toy soldier"];
    let puppetLabels = ["a puppet", "a marionette"];
    let gameLabels = ["a board game", "a jigsaw puzzle", "a card game"];
    let dollsHouseLabels = ["a dolls house", "a miniature room", "dolls house furniture"];
    let accessoryLabels = ["doll clothing", "doll accessories"];

    if (vehicleLabels.indexOf(specificLabel) != -1) { return 'a toy vehicle or mechanical toy'; }
    if (dollLabels.indexOf(specificLabel) != -1) { return 'a doll'; }
    if (softToyLabels.indexOf(specificLabel) != -1) { return 'a soft toy or teddy bear'; }
    if (actionFigureLabels.indexOf(specificLabel) != -1) { return 'an action figure or toy soldier'; }
    if (puppetLabels.indexOf(specificLabel) != -1) { return 'a puppet or marionette'; }
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
    if (type.indexOf('puppet') != -1 || type.indexOf('marionette') != -1) {
        return 'a puppet or marionette';
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

function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
}

function applyObjectTypeMapping(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        objectList[i].cluster = mapObjectTypeToCluster(objectList[i].objectType);
    }
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


function delay(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function movePreClustered(objectList) {
    console.log('Moving ' + objectList.length + ' objects with pre-assigned cluster values into visual clouds...');
    for (let i = 0; i < objectList.length; i++) {
        moveCardToCloud(objectList[i]);
        updateResultsStatus('Loading pre-classified objects — ' + (i + 1) + ' / ' + objectList.length + ' placed into clusters...');
        await delay(80);
    }
}

function exportClusters(objectList) {
    let data = {};
    for (let i = 0; i < objectList.length; i++) {
        let obj = objectList[i];
        if (obj.specificLabel != null) {
            data[obj.systemNumber] = {
                specificLabel: obj.specificLabel,
                cluster: obj.cluster,
                material: obj.material
            };
        }
    }
    let json = JSON.stringify(data, null, 2);
    let blob = new Blob([json], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'clusters.json';
    a.click();
    URL.revokeObjectURL(url);
}

async function fetchPreClusters() {
    try {
        let response = await fetch('clusters.json');
        if (!response.ok) { return null; }
        return await response.json();
    } catch (error) {
        return null;
    }
}

async function classifyAll(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        let obj = objectList[i];
        let progress = (i + 1) + ' / ' + objectList.length;
        let card = cardMap[obj.systemNumber];

        if (card != null) { card.setAttribute('data-classifying', 'true'); }
        updateResultsStatus('AI classifying (' + progress + ') — ' + obj.title + (obj.objectType ? ' [' + obj.objectType + ']' : '') + '...');

        let imgSrc = imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg";
        try {
            let result = await classifyImage(imgSrc, specificTypeLabels, materialLabels);
            obj.specificLabel = result.specificLabel;
            obj.cluster = mapSpecificToCluster(result.specificLabel);
            obj.material = result.material;
        } catch (error) {
            console.error('Classification error for "' + obj.title + '":', error);
        }

        if (card != null) { card.removeAttribute('data-classifying'); }

        let clusterName = clusterDisplayNames[obj.cluster] || obj.cluster || '';
        console.log('Assigning a cluster to: "' + obj.title + '" (' + (i + 1) + ' of ' + objectList.length + ')');
        console.log('Moving "' + obj.title + '" to cloud: ' + clusterName + ' (identified as: ' + obj.specificLabel + ')');

        updateResultsStatus('Classified (' + progress + '): ' + obj.title + '  →  AI label: ' + (obj.specificLabel || 'unrecognised') + '  →  Cluster: ' + clusterName);
        moveCardToCloud(obj);
        saveCache(currentObjectList);
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

function createGroupSection(key, dataAttrName) {
    let sec = document.createElement('section');
    sec.setAttribute(dataAttrName, key);
    let heading = document.createElement('h2');
    heading.textContent = clusterDisplayNames[key] || key;
    sec.appendChild(heading);
    return sec;
}

function renderPendingSection(unclassified, allObjects) {
    for (let i = 0; i < allObjects.length; i++) {
        if (cardMap[allObjects[i].systemNumber] == null) {
            cardMap[allObjects[i].systemNumber] = createCard(allObjects[i]);
        }
    }
    let heading = document.createElement('h2');
    heading.id = 'pending-heading';
    heading.textContent = 'Queued for AI classification';
    pendingEl.appendChild(heading);
    for (let i = 0; i < unclassified.length; i++) {
        pendingEl.appendChild(cardMap[unclassified[i].systemNumber]);
    }
}

function collapsePending() {
    if (pendingEl == null) { return; }
    console.log('All objects clustered — removing pending section.');
    pendingEl.parentNode.removeChild(pendingEl);
    pendingEl = null;
}

function getOrCreateCloudSection(clusterKey) {
    let sections = cloudAreaEl.querySelectorAll('section');
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].getAttribute('data-cluster') == clusterKey) {
            return sections[i];
        }
    }
    let sec = createGroupSection(clusterKey, 'data-cluster');
    cloudAreaEl.appendChild(sec);
    return sec;
}

function buildHoverText(obj) {
    var parts = [obj.title];
    if (obj.specificLabel) { parts.push(obj.specificLabel); }
    var clusterName = clusterDisplayNames[obj.cluster] || '';
    if (clusterName) { parts.push(clusterName); }
    return parts.join(' | ');
}

function moveCardToCloud(obj) {
    let cloudSection = getOrCreateCloudSection(obj.cluster);
    let card = cardMap[obj.systemNumber];
    let h2 = card.querySelector('h2');
    if (h2 != null) { h2.textContent = buildHoverText(obj); }
    cloudSection.appendChild(card);
    repositionClouds();
}


async function displayObjects() {
    const records = await fetchData();
    const objectList = buildObjectList(records);
    shuffleArray(objectList);

    currentObjectList = objectList;
    setupFilters();

    pendingEl = document.createElement('section');
    pendingEl.setAttribute('data-pending', 'true');
    cloudAreaEl = document.createElement('section');
    cloudAreaEl.setAttribute('data-cloud-area', 'true');
    main.appendChild(pendingEl);
    main.appendChild(cloudAreaEl);

    renderClouds();

    applyObjectTypeMapping(objectList);

    let preClusters = await fetchPreClusters();
    if (preClusters != null) {
        applyCache(objectList, preClusters);
    }

    let preclustered = [];
    let unclassified = [];
    for (let i = 0; i < objectList.length; i++) {
        if (objectList[i].specificLabel != null) {
            preclustered.push(objectList[i]);
        } else {
            unclassified.push(objectList[i]);
        }
    }

    renderPendingSection(unclassified, objectList);

    if (unclassified.length > 0) {
        updateResultsStatus('Loading ' + preclustered.length + ' pre-classified objects — ' + unclassified.length + ' objects queued for live AI...');
    } else {
        updateResultsStatus('Loading ' + preclustered.length + ' pre-classified objects...');
    }

    await movePreClustered(preclustered);

    if (unclassified.length > 0) {
        let pendingHeading = document.getElementById('pending-heading');
        if (pendingHeading != null) { pendingHeading.textContent = 'AI is classifying these now...'; }
        updateResultsStatus('Pre-loading complete — starting live AI classification of ' + unclassified.length + ' objects...');
        let startTime = Date.now();
        console.log('Running AI classification... ' + new Date().toLocaleTimeString());
        await classifyAll(unclassified);
        let elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('AI done. Time taken: ' + elapsed + 's');
    }

    collapsePending();
    saveCache(objectList);
    updateResultsStatus('All ' + objectList.length + ' objects clustered — ready to explore.');

    // let exportBtn = document.getElementById('btn-export');
    // if (exportBtn != null) {
    //     exportBtn.disabled = false;
    //     exportBtn.addEventListener('click', function() {
    //         exportClusters(currentObjectList);
    //     });
    // }
}

displayObjects();
