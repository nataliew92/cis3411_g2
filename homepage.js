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

var physicsEngine = null;
var physicsRunner = null;
var physicsBodies = {};
var clusterCenters = {};
var objLookup = {};
var physicsSettled = false;

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


function calculateClusterCenters(mode) {
    clusterCenters = {};
    var keys = mode == 'category' ? clusterLabels : materialFilterLabels;
    var width = cloudAreaEl.offsetWidth;

    var cols = 2;
    if (width < 500) { cols = 1; }

    // Count how many classified objects belong to each cluster key
    var countPerKey = {};
    for (var j = 0; j < currentObjectList.length; j++) {
        var obj = currentObjectList[j];
        var groupKey = mode == 'category' ? obj.cluster : obj.material;
        if (groupKey == null) { continue; }
        if (countPerKey[groupKey] == null) { countPerKey[groupKey] = 0; }
        countPerKey[groupKey]++;
    }

    var padX = 180;
    var padY = 220;
    var gapH = 80;
    var waveAmplitude = 130;
    var cellW = (width - padX * 2) / cols;

    // Each column tracks its own running y position independently
    var colTops = [];
    for (var c = 0; c < cols; c++) { colTops.push(padY); }

    var maxBottom = padY;

    for (var i = 0; i < keys.length; i++) {
        var col = i % cols;
        var count = countPerKey[keys[i]] || 0;
        // Taller space for larger clusters; sqrt keeps the scale from getting extreme
        var clusterH = Math.max(300, Math.round(40 * Math.sqrt(count)) + 150);
        // Odd columns shift down, even columns shift up
        var waveOffset = (col % 2 == 0 ? -1 : 1) * waveAmplitude;
        clusterCenters[keys[i]] = {
            x: padX + col * cellW + cellW / 2,
            y: colTops[col] + clusterH / 2 + waveOffset
        };
        colTops[col] += clusterH + gapH;
        if (colTops[col] > maxBottom) { maxBottom = colTops[col]; }
    }

    cloudAreaEl.style.minHeight = (maxBottom + padY + waveAmplitude) + 'px';
}

function repositionLabels() {
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';
    var keys = getGroupKeys();
    for (var i = 0; i < keys.length; i++) {
        var center = clusterCenters[keys[i]];
        if (center == null) { continue; }
        var sec = cloudAreaEl.querySelector('section[' + dataAttr + '="' + keys[i] + '"]');
        if (sec == null) { continue; }
        sec.style.left = (center.x - sec.offsetWidth / 2) + 'px';
        sec.style.top = (center.y - 160) + 'px';
    }
}

function initPhysics() {
    physicsEngine = Matter.Engine.create();
    physicsEngine.gravity.x = 0;
    physicsEngine.gravity.y = 0;
    physicsRunner = Matter.Runner.create();
    Matter.Runner.run(physicsRunner, physicsEngine);
    Matter.Events.on(physicsEngine, 'beforeUpdate', applyCentripetalForce);
}

function applyCentripetalForce() {
    if (physicsSettled) { return; }
    var strength = 0.0001;
    var deadZone = 100; // cards within this radius of their centre settle freely
    for (var sysNum in physicsBodies) {
        var body = physicsBodies[sysNum];
        var obj = objLookup[sysNum];
        if (obj == null) { continue; }
        var groupKey = getObjectGroupKey(obj);
        var center = clusterCenters[groupKey];
        if (center == null) { continue; }
        var dx = center.x - body.position.x;
        var dy = center.y - body.position.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < deadZone) { continue; }
        Matter.Body.applyForce(body, body.position, { x: dx * strength, y: dy * strength });
    }
}

function settlePhysics() {
    physicsSettled = true;
    for (var sysNum in physicsBodies) {
        Matter.Body.setVelocity(physicsBodies[sysNum], { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(physicsBodies[sysNum], 0);
    }
}

function startRenderLoop() {
    function tick() {
        for (var sysNum in physicsBodies) {
            var body = physicsBodies[sysNum];
            var card = cardMap[sysNum];
            if (card == null) { continue; }
            card.style.left = (body.position.x - 18) + 'px';
            card.style.top = (body.position.y - 18) + 'px';
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function spawnCardBody(obj) {
    if (physicsEngine == null) { return; }
    var groupKey = getObjectGroupKey(obj);
    var center = clusterCenters[groupKey];
    if (center == null) { return; }
    var radius = 20;
    var spawnX = center.x + (Math.random() - 0.5) * 220;
    var spawnY = center.y + (Math.random() - 0.5) * 220;
    var body = Matter.Bodies.circle(spawnX, spawnY, radius, {
        label: obj.systemNumber,
        restitution: 0.2,
        friction: 0.1,
        frictionAir: 0.1
    });
    Matter.World.add(physicsEngine.world, body);
    physicsBodies[obj.systemNumber] = body;
}

function renderClouds() {
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';
    physicsSettled = false; // re-enable centripetal force for the new layout

    // Remove all physics bodies from the world
    var bodyArr = [];
    for (var sysNum in physicsBodies) {
        bodyArr.push(physicsBodies[sysNum]);
    }
    if (physicsEngine != null && bodyArr.length > 0) {
        Matter.World.remove(physicsEngine.world, bodyArr);
    }
    physicsBodies = {};

    // Clear the cloud area DOM
    while (cloudAreaEl.firstChild) {
        cloudAreaEl.removeChild(cloudAreaEl.firstChild);
    }

    calculateClusterCenters(groupingMode);

    // Create a floating label section at each cluster center
    var keys = getGroupKeys();
    for (var i = 0; i < keys.length; i++) {
        var center = clusterCenters[keys[i]];
        var sec = document.createElement('section');
        sec.setAttribute(dataAttr, keys[i]);
        var heading = document.createElement('h2');
        heading.textContent = getGroupDisplayName(keys[i]);
        sec.appendChild(heading);
        cloudAreaEl.appendChild(sec);
        // Centre horizontally on the cluster point; sit above where cards will settle
        sec.style.left = (center.x - sec.offsetWidth / 2) + 'px';
        sec.style.top = (center.y - 160) + 'px';
        sec.style.zIndex = '15';
    }

    // Re-add all classified cards directly into cloudAreaEl and spawn their bodies
    for (var i = 0; i < currentObjectList.length; i++) {
        var obj = currentObjectList[i];
        var groupKey = getObjectGroupKey(obj);
        if (groupKey == null) { continue; }
        var card = cardMap[obj.systemNumber];
        if (card == null) { continue; }
        var h2 = card.querySelector('h2');
        if (h2 != null) { h2.textContent = buildHoverText(obj); }
        cloudAreaEl.appendChild(card);
        spawnCardBody(obj);
    }

    activeGroup = null;
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


function buildHoverText(obj) {
    var parts = [obj.title];
    if (obj.specificLabel) { parts.push(obj.specificLabel); }
    var clusterName = clusterDisplayNames[obj.cluster] || '';
    if (clusterName) { parts.push(clusterName); }
    return parts.join(' | ');
}

function moveCardToCloud(obj) {
    var card = cardMap[obj.systemNumber];
    if (card == null) { return; }
    var h2 = card.querySelector('h2');
    if (h2 != null) { h2.textContent = buildHoverText(obj); }
    if (card.parentNode != cloudAreaEl) {
        // Switch to absolute positioning so the physics render loop can place it
        card.style.position = 'absolute';
        card.style.left = '-9999px';
        card.style.top = '-9999px';
        cloudAreaEl.appendChild(card);
    }
    // Remove any existing body before spawning a new one (e.g. re-classification)
    if (physicsBodies[obj.systemNumber] != null) {
        Matter.World.remove(physicsEngine.world, physicsBodies[obj.systemNumber]);
        delete physicsBodies[obj.systemNumber];
    }
    spawnCardBody(obj);
}


async function displayObjects() {
    const records = await fetchData();
    const objectList = buildObjectList(records);
    shuffleArray(objectList);

    currentObjectList = objectList;

    // Build objLookup so the centripetal force handler can find any object by systemNumber
    for (var i = 0; i < objectList.length; i++) {
        objLookup[objectList[i].systemNumber] = objectList[i];
    }

    setupFilters();

    pendingEl = document.createElement('section');
    pendingEl.setAttribute('data-pending', 'true');
    cloudAreaEl = document.createElement('section');
    cloudAreaEl.setAttribute('data-cloud-area', 'true');
    main.appendChild(pendingEl);
    main.appendChild(cloudAreaEl);

    initPhysics();
    startRenderLoop();
    renderClouds();

    applyObjectTypeMapping(objectList);

    let preClusters = await fetchPreClusters();
    if (preClusters != null) {
        applyCache(objectList, preClusters);
        // Re-calculate centers now that we know actual cluster counts, then move labels to match
        calculateClusterCenters(groupingMode);
        repositionLabels();
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
    settlePhysics();

    // let exportBtn = document.getElementById('btn-export');
    // if (exportBtn != null) {
    //     exportBtn.disabled = false;
    //     exportBtn.addEventListener('click', function() {
    //         exportClusters(currentObjectList);
    //     });
    // }
}

displayObjects();
