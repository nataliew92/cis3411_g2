import { classifyImage } from './homepage_model.js';


const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=100&data_restrict=descriptive_only";
const imageUrl = "https://framemark.vam.ac.uk/collections";
const main = document.getElementById('homepage');
const cacheKey = "va_cluster_cache";
const filterCategoryOptions = document.getElementById('filter-category-options');
const filterMaterialOptions = document.getElementById('filter-material-options');
const filterSearchType = document.getElementById('filter-search-type');
const filterSearchMat = document.getElementById('filter-search-mat');

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

const specificMaterialLabels = [
    "a celluloid toy",
    "a hard plastic toy",
    "a soft plastic or vinyl toy",
    "a painted wooden toy",
    "a plain wooden toy",
    "a tin toy",
    "a cast iron toy",
    "a wire or metal toy",
    "a felt toy",
    "a knitted or wool toy",
    "a cotton or cloth toy",
    "a silk or satin toy",
    "a papier-mache toy",
    "a cardboard toy",
    "a bisque porcelain toy",
    "a glazed ceramic toy"
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
let searchTypeText = '';
let searchMatText = '';
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
var settleTimer = null;
var cardHalfSize = 14; // half of rendered card width, updated from DOM and on resize

var aiNoticeDismiss = document.getElementById('ai-notice-dismiss');
if (aiNoticeDismiss != null) {
    aiNoticeDismiss.addEventListener('click', function() {
        var notice = document.getElementById('ai-notice');
        if (notice != null) { notice.hidden = true; }
    });
}

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
            displayName: record._primaryTitle || record.objectType || 'Untitled',
            imageId: record._primaryImageId,
            date: record._primaryDate,
            place: record._primaryPlace,
            maker: makerName,
            specificLabel: null,
            cluster: null,
            material: null,
            apiMaterial: null
        };

        objectList.push(obj);
    }
    return objectList;
}


function renderFilterButtons(container, mode) {
    container.innerHTML = '';

    var labels = mode == 'category' ? clusterLabels : materialFilterLabels;
    var displayNames = mode == 'category' ? clusterDisplayNames : materialDisplayNames;

    for (var i = 0; i < labels.length; i++) {
        var btn = document.createElement('button');
        btn.textContent = displayNames[labels[i]];
        btn.dataset.value = labels[i];
        btn.dataset.mode = mode;
        btn.setAttribute('aria-pressed', 'false');

        var li = document.createElement('li');
        btn.addEventListener('click', function() {
            var key = this.dataset.value;
            var btnMode = this.dataset.mode;
            var btnCategory = document.getElementById('btn-category');
            var btnMaterial = document.getElementById('btn-material');

            if (groupingMode != btnMode) {
                groupingMode = btnMode;
                renderClouds();
                if (settleTimer != null) { clearTimeout(settleTimer); }
                settleTimer = setTimeout(settlePhysics, 4000);
                if (btnMode == 'category') {
                    btnCategory.setAttribute('aria-pressed', 'true');
                    btnMaterial.setAttribute('aria-pressed', 'false');
                } else {
                    btnMaterial.setAttribute('aria-pressed', 'true');
                    btnCategory.setAttribute('aria-pressed', 'false');
                }
            }

            scrollToCloud(key);

            var allSubBtns = document.querySelectorAll('#filter-category-options button, #filter-material-options button');
            for (var j = 0; j < allSubBtns.length; j++) {
                allSubBtns[j].setAttribute('aria-pressed', allSubBtns[j].dataset.value == activeGroup ? 'true' : 'false');
            }
        });

        li.appendChild(btn);
        container.appendChild(li);
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

    var cols = 3;
    if (width < 900) { cols = 2; }
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

    var padX = 100;
    var padY = 60;
    var gapH = 100;
    var waveAmplitude = 20;
    var cellW = (width - padX * 2) / cols;

    // Each column tracks its own running y position independently
    var colTops = [];
    for (var c = 0; c < cols; c++) { colTops.push(padY); }

    var maxBottom = padY;

    for (var i = 0; i < keys.length; i++) {
        var col = i % cols;
        var count = countPerKey[keys[i]] || 0;
        // Taller space for larger clusters; sqrt keeps the scale from getting extreme
        var clusterH = Math.max(180, Math.round(16 * Math.sqrt(count)) + 100);
        // Alternate: even-indexed clusters sit higher in their slot (top), odd lower (bottom)
        var waveOffset = (i % 2 == 0 ? -1 : 1) * Math.round(clusterH * 0.2);
        clusterCenters[keys[i]] = {
            x: padX + col * cellW + cellW / 2,
            y: colTops[col] + clusterH / 2 + waveOffset
        };
        colTops[col] += clusterH + gapH;
        if (colTops[col] > maxBottom) { maxBottom = colTops[col]; }
    }

    cloudAreaEl.style.minHeight = (maxBottom + 60) + 'px';
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
        sec.style.top = (center.y - 70) + 'px';
    }
}

function updateCardSize() {
    var sample = document.querySelector('#homepage article');
    if (sample != null && sample.offsetWidth > 0) {
        cardHalfSize = Math.round(sample.offsetWidth / 2);
        return;
    }
    // Fallback when no cards are in DOM: approximate from CSS clamp(14px, 2vw, 28px)
    cardHalfSize = Math.round(Math.min(28, Math.max(14, window.innerWidth * 0.02)) / 2);
}

function initPhysics() {
    physicsEngine = Matter.Engine.create();
    physicsEngine.gravity.x = 0;
    physicsEngine.gravity.y = 0;
    physicsRunner = Matter.Runner.create();
    Matter.Runner.run(physicsRunner, physicsEngine);
    Matter.Events.on(physicsEngine, 'beforeUpdate', applyCentripetalForce);
    window.addEventListener('resize', updateCardSize);
}

function applyCentripetalForce() {
    if (physicsSettled) { return; }
    var strength = 0.0002;
    var deadZone = Math.max(60, cardHalfSize * 4); // scales with card size
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
        var body = physicsBodies[sysNum];
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
        Matter.Body.setStatic(body, true);
    }
}

function startRenderLoop() {
    function tick() {
        for (var sysNum in physicsBodies) {
            var body = physicsBodies[sysNum];
            var card = cardMap[sysNum];
            if (card == null) { continue; }
            var clampedY = Math.max(cardHalfSize, body.position.y);
            card.style.left = (body.position.x - cardHalfSize) + 'px';
            card.style.top = (clampedY - cardHalfSize) + 'px';
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
    var radius = cardHalfSize + 2; // slight gap between cards without excessive spread
    var spread = Math.max(60, cardHalfSize * 6);
    var spawnX = center.x + (Math.random() - 0.5) * spread;
    var spawnY = Math.max(cardHalfSize + 5, center.y + (Math.random() - 0.5) * spread);
    var body = Matter.Bodies.circle(spawnX, spawnY, radius, {
        label: obj.systemNumber,
        restitution: 0.05,
        friction: 0.1,
        frictionAir: 0.35
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
        sec.style.top = (center.y - 70) + 'px';
        sec.style.zIndex = '15';
    }

    // Re-add all classified cards directly into cloudAreaEl and spawn their bodies
    for (var i = 0; i < currentObjectList.length; i++) {
        var obj = currentObjectList[i];
        var groupKey = getObjectGroupKey(obj);
        if (groupKey == null) { continue; }
        var card = cardMap[obj.systemNumber];
        if (card == null) { continue; }
        var h2 = card.querySelector('h3');
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
        var body = physicsBodies[obj.systemNumber];

        var typeMatch = true;
        var matMatch = true;

        if (searchTypeText != '') {
            typeMatch = (obj.displayName && obj.displayName.toLowerCase().indexOf(searchTypeText) != -1) ||
                        (obj.specificLabel && obj.specificLabel.indexOf(searchTypeText) != -1) ||
                        (obj.objectType && obj.objectType.toLowerCase().indexOf(searchTypeText) != -1);
        }
        if (searchMatText != '') {
            matMatch = (obj.material && obj.material.indexOf(searchMatText) != -1) ||
                       (obj.apiMaterial && obj.apiMaterial.toLowerCase().indexOf(searchMatText) != -1);
        }

        var visible = typeMatch && matMatch;
        card.style.display = visible ? '' : 'none';
        if (body != null) { Matter.Body.setStatic(body, !visible); }
    }
}

function setupFilters() {
    var btnCategory = document.getElementById('btn-category');
    var btnMaterial = document.getElementById('btn-material');

    renderFilterButtons(filterCategoryOptions, 'category');
    renderFilterButtons(filterMaterialOptions, 'material');

    btnCategory.addEventListener('click', function() {
        groupingMode = 'category';
        btnCategory.setAttribute('aria-pressed', 'true');
        btnMaterial.setAttribute('aria-pressed', 'false');
        renderClouds();
        if (settleTimer != null) { clearTimeout(settleTimer); }
        settleTimer = setTimeout(settlePhysics, 4000);
    });

    btnMaterial.addEventListener('click', function() {
        groupingMode = 'material';
        btnMaterial.setAttribute('aria-pressed', 'true');
        btnCategory.setAttribute('aria-pressed', 'false');
        renderClouds();
        if (settleTimer != null) { clearTimeout(settleTimer); }
        settleTimer = setTimeout(settlePhysics, 4000);
    });

    filterSearchType.addEventListener('input', function() {
        searchTypeText = filterSearchType.value.toLowerCase();
        applySearch();
    });
    filterSearchMat.addEventListener('input', function() {
        searchMatText = filterSearchMat.value.toLowerCase();
        applySearch();
    });
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

function mapSpecificToMaterial(specificMaterialLabel) {
    var plasticLabels = ["a celluloid toy", "a hard plastic toy", "a soft plastic or vinyl toy"];
    var woodLabels = ["a painted wooden toy", "a plain wooden toy"];
    var metalLabels = ["a tin toy", "a cast iron toy", "a wire or metal toy"];
    var fabricLabels = ["a felt toy", "a knitted or wool toy", "a cotton or cloth toy", "a silk or satin toy"];
    var paperLabels = ["a papier-mache toy", "a cardboard toy"];
    var ceramicLabels = ["a bisque porcelain toy", "a glazed ceramic toy"];

    if (plasticLabels.indexOf(specificMaterialLabel) != -1) { return 'a plastic toy'; }
    if (woodLabels.indexOf(specificMaterialLabel) != -1) { return 'a wooden toy'; }
    if (metalLabels.indexOf(specificMaterialLabel) != -1) { return 'a metal toy'; }
    if (fabricLabels.indexOf(specificMaterialLabel) != -1) { return 'a fabric or cloth toy'; }
    if (paperLabels.indexOf(specificMaterialLabel) != -1) { return 'a paper toy'; }
    if (ceramicLabels.indexOf(specificMaterialLabel) != -1) { return 'a ceramic or porcelain toy'; }
    return specificMaterialLabel;
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
            material: objectList[i].material,
            apiMaterial: objectList[i].apiMaterial
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
            objectList[i].apiMaterial = cached.apiMaterial || null;
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
        updateResultsStatus('Loading pre-classified objects: ' + (i + 1) + ' / ' + objectList.length + ' placed into clusters...');
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
                material: obj.material,
                apiMaterial: obj.apiMaterial || null
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

async function fetchObjectMaterial(systemNumber) {
    try {
        var response = await fetch('https://api.vam.ac.uk/v2/object/' + systemNumber);
        if (!response.ok) { return null; }
        var data = await response.json();
        if (data.record == null) { return null; }
        var record = data.record;
        if (record.materials != null) {
            if (typeof record.materials === 'string' && record.materials.length > 0) {
                return record.materials;
            }
            if (Array.isArray(record.materials) && record.materials.length > 0) {
                if (typeof record.materials[0] === 'string') { return record.materials[0]; }
                if (record.materials[0].text) { return record.materials[0].text; }
            }
        }
        if (record.materialsAndTechniques != null && record.materialsAndTechniques.length > 0) {
            return record.materialsAndTechniques;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function fetchApiMaterials(objectList) {
    for (var i = 0; i < objectList.length; i++) {
        updateResultsStatus('Fetching material data: ' + (i + 1) + ' / ' + objectList.length + '...');
        objectList[i].apiMaterial = await fetchObjectMaterial(objectList[i].systemNumber);
    }
}

async function classifyAll(objectList) {
    for (var i = 0; i < objectList.length; i++) {
        var obj = objectList[i];
        var progress = (i + 1) + ' / ' + objectList.length;
        var card = cardMap[obj.systemNumber];

        if (card != null) { card.setAttribute('data-classifying', 'true'); }
        updateResultsStatus('AI classifying (' + progress + '): ' + obj.displayName + (obj.apiMaterial ? ' (' + obj.apiMaterial + ')' : '') + '...');

        var imgSrc = imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg";
        try {
            var result = await classifyImage(imgSrc, specificTypeLabels, specificMaterialLabels);
            obj.specificLabel = result.specificLabel;
            obj.cluster = mapSpecificToCluster(result.specificLabel);
            var specificMat = result.material;
            obj.material = mapSpecificToMaterial(specificMat);
            var typeConfidence = result.typeScore || 0;
            var matConfidence = result.materialScore || 0;
        } catch (error) {
            console.error('Classification error for "' + obj.title + '":', error);
        }

        if (card != null) { card.removeAttribute('data-classifying'); }

        var clusterName = clusterDisplayNames[obj.cluster] || obj.cluster || 'Unclassified';

        var matClusterName = materialDisplayNames[obj.material] || obj.material || 'Unknown';

        console.log(
            '[' + (i + 1) + '/' + objectList.length + '] ' + obj.displayName +
            ' | API type: ' + (obj.objectType || 'unknown') +
            ' | API material: ' + (obj.apiMaterial || 'none') +
            ' | AI object: ' + (obj.specificLabel || 'unrecognised') + ' -> ' + clusterName + ' (' + Math.round(typeConfidence * 100) + '%)' +
            ' | AI material: ' + (specificMat || 'unrecognised') + ' -> ' + matClusterName + ' (' + Math.round(matConfidence * 100) + '%)'
        );

        var logList = document.getElementById('ai-log');
        if (logList != null) {
            var logItem = document.createElement('li');

            var nameSpan = document.createElement('span');
            nameSpan.className = 'ai-log-name';
            nameSpan.textContent = obj.displayName;

            var apiSpan = document.createElement('span');
            apiSpan.className = 'ai-log-api';
            apiSpan.textContent = 'API object type: ' + (obj.objectType || 'unknown');

            var apiMatSpan = document.createElement('span');
            apiMatSpan.className = 'ai-log-api';
            apiMatSpan.textContent = 'API material: ' + (obj.apiMaterial || 'not available');

            var aiObjSpan = document.createElement('span');
            aiObjSpan.className = 'ai-log-ai';
            aiObjSpan.textContent = 'AI object label: ' + (obj.specificLabel || 'unrecognised') + ' - ' + clusterName + ' (' + Math.round(typeConfidence * 100) + '% confidence)';

            var aiMatSpan = document.createElement('span');
            aiMatSpan.className = 'ai-log-material';
            aiMatSpan.textContent = 'AI material label: ' + (specificMat || 'unrecognised') + ' - ' + matClusterName + ' (' + Math.round(matConfidence * 100) + '% confidence)';

            logItem.appendChild(nameSpan);
            logItem.appendChild(apiSpan);
            logItem.appendChild(apiMatSpan);
            logItem.appendChild(aiObjSpan);
            logItem.appendChild(aiMatSpan);
            logList.appendChild(logItem);
            logItem.scrollIntoView({ block: 'nearest' });
        }

        moveCardToCloud(obj);
        saveCache(currentObjectList);

        var remaining = objectList.length - (i + 1);
        var panelTitle = document.getElementById('ai-panel-title');
        if (panelTitle != null) {
            panelTitle.textContent = remaining > 0
                ? 'Items to be classified (' + remaining + ')'
                : 'All items classified';
        }

        updateResultsStatus('Assigned (' + progress + '): "' + obj.displayName + '" placed in ' + clusterName);
        await delay(600);
    }
}

function createCard(obj) {
    const card = document.createElement('article');
    card.setAttribute('aria-label', obj.title);
    card.dataset.id = obj.systemNumber;
    const imgSrc = imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg";
    card.innerHTML =
        '<h3>' + obj.title + '</h3>' +
        '<picture>' +
            '<img src="' + imgSrc + '" alt="" width="400" height="400" loading="lazy">' +
        '</picture>';
    card.addEventListener('click', function() {
        window.location.href = 'details.html?id=' + obj.systemNumber;
    });
    return card;
}


function renderPendingSection(unclassified, allObjects) {
    for (var i = 0; i < allObjects.length; i++) {
        if (cardMap[allObjects[i].systemNumber] == null) {
            cardMap[allObjects[i].systemNumber] = createCard(allObjects[i]);
        }
    }
    if (unclassified.length == 0) { return; }

    pendingEl = document.createElement('aside');
    pendingEl.id = 'ai-panel';

    var header = document.createElement('header');
    header.id = 'ai-panel-header';

    var title = document.createElement('h2');
    title.id = 'ai-panel-title';
    title.textContent = 'Items to be classified (' + unclassified.length + ')';

    var closeBtn = document.createElement('button');
    closeBtn.id = 'ai-panel-close';
    closeBtn.textContent = 'x';
    closeBtn.setAttribute('aria-label', 'Close AI classification panel');
    closeBtn.addEventListener('click', function() {
        var panel = document.getElementById('ai-panel');
        if (panel != null && panel.parentNode != null) {
            panel.parentNode.removeChild(panel);
        }
        pendingEl = null;
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    pendingEl.appendChild(header);

    var cardGrid = document.createElement('div');
    cardGrid.id = 'ai-pending-cards';
    for (var i = 0; i < unclassified.length; i++) {
        cardGrid.appendChild(cardMap[unclassified[i].systemNumber]);
    }
    pendingEl.appendChild(cardGrid);

    var log = document.createElement('ul');
    log.id = 'ai-log';
    pendingEl.appendChild(log);

    var pageBody = document.querySelector('main');
    pageBody.appendChild(pendingEl);
}

function collapsePending() {
    if (pendingEl == null) { return; }
    var el = pendingEl;
    pendingEl = null;
    el.style.transition = 'opacity 0.8s';
    el.style.opacity = '0';
    setTimeout(function() {
        if (el.parentNode != null) { el.parentNode.removeChild(el); }
    }, 900);
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
    var h2 = card.querySelector('h3');
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

    cloudAreaEl = document.createElement('section');
    cloudAreaEl.setAttribute('data-cloud-area', 'true');
    main.appendChild(cloudAreaEl);

    initPhysics();
    startRenderLoop();
    renderClouds();

    applyObjectTypeMapping(objectList);

    let preClusters = await fetchPreClusters();
    if (preClusters != null) {
        applyCache(objectList, preClusters);
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
    // Aside is now in DOM — cloudAreaEl.offsetWidth now reflects the narrowed width, recalculate
    calculateClusterCenters(groupingMode);
    repositionLabels();
    updateCardSize(); // measure actual rendered card size

    if (unclassified.length > 0) {
        updateResultsStatus('Loading ' + preclustered.length + ' pre-classified objects, ' + unclassified.length + ' objects queued for live AI...');
    } else {
        updateResultsStatus('Loading ' + preclustered.length + ' pre-classified objects...');
    }

    await movePreClustered(preclustered);

    if (unclassified.length > 0) {
        await fetchApiMaterials(unclassified);
        updateResultsStatus('Pre-loading complete. Starting live AI classification of ' + unclassified.length + ' objects...');
        let startTime = Date.now();
        console.log('Running AI classification... ' + new Date().toLocaleTimeString());
        await classifyAll(unclassified);
        let elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('AI done. Time taken: ' + elapsed + 's');
    }

    saveCache(objectList);
    updateResultsStatus('All ' + objectList.length + ' objects clustered. Ready to explore.');
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
