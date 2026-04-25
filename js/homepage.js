import { classifyImage } from './homepage_model.js';

const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=100&data_restrict=descriptive_only";
const imageUrl = "https://framemark.vam.ac.uk/collections";
const cacheKey = "va_cluster_cache";

const specificTypeLabels = [
    "a toy car", "a toy plane", "a toy train", "a toy boat", "a toy truck", "a toy tractor",
    "a clockwork toy", "a pull-along toy", "a ride-on toy", "a doll", "a baby doll",
    "a fashion doll", "a paper doll", "a porcelain doll", "a rag doll", "a teddy bear",
    "a soft toy", "a stuffed animal", "an action figure", "a toy soldier",
    "a soft character toy", "a character doll", "a plush toy", "a puppet",
    "a marionette", "a board game", "a jigsaw puzzle", "a card game", "a dolls house",
    "a miniature room", "dolls house furniture", "doll clothing", "doll accessories"
];

const specificMaterialLabels = [
    "a celluloid toy", "a hard plastic toy", "a soft plastic or vinyl toy",
    "a painted wooden toy", "a plain wooden toy", "a tin toy", "a cast iron toy",
    "a wire or metal toy", "a felt toy", "a knitted or wool toy", "a cotton or cloth toy",
    "a silk or satin toy", "a papier-mache toy", "a cardboard toy",
    "a bisque porcelain toy", "a glazed ceramic toy"
];

const clusterLabels = [
    'a toy vehicle or mechanical toy', 'a doll', 'a soft toy or teddy bear',
    'an action figure or toy soldier', 'a puppet or marionette', 'a game or puzzle',
    'a dolls house or miniature room', 'doll clothing or doll accessories'
];

const materialFilterLabels = [
    'a plastic toy', 'a wooden toy', 'a metal toy', 'a fabric or cloth toy',
    'a paper toy', 'a ceramic or porcelain toy'
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
var cardHalfSize = 14;

var scrollHintShown = false;
var scrollMode = 'normal';
var zoomLevel = 1;
var zoomTx = 0;
var zoomTy = 0;
var focusKeys = [];
var focusClusterIndex = 0;
var focusScrollAcc = 0;
var FOCUS_SCROLL_THRESHOLD = 300;
var mouseClientX = 0;
var mouseClientY = 0;
var cloudBaseX = 0;
var cloudBaseY = 0;
var isDragging = false;
var dragStartX = 0;
var dragStartTx = 0;

const LOADING_TOOLTIP = "Filtering will be available once all items are loaded and clustered.";

// Setup listeners immediately
document.addEventListener('DOMContentLoaded', function() {
    var aiNoticeDismiss = document.getElementById('ai-notice-dismiss');
    if (aiNoticeDismiss != null) {
        aiNoticeDismiss.addEventListener('click', function() {
            var notice = document.getElementById('ai-notice');
            if (notice != null) { notice.hidden = true; }
        });
    }

    var scrollHintDismiss = document.getElementById('scroll-hint-dismiss');
    if (scrollHintDismiss != null) {
        scrollHintDismiss.addEventListener('click', function() {
            var hint = document.getElementById('scroll-hint');
            if (hint != null) { hint.hidden = true; }
        });
    }

    var readyClose = document.getElementById('ready-popup-close');
    if (readyClose) {
        readyClose.addEventListener('click', function() {
            document.getElementById('ready-popup').close();
        });
    }

    document.getElementById('nav-arrow-left').addEventListener('click', () => panBy(-300));
    document.getElementById('nav-arrow-right').addEventListener('click', () => panBy(300));
});

function panBy(amount) {
    zoomTx -= amount;
    clampPanX();
    applyCurrentTransform();
}

function updateNavArrows() {
    var leftArrow = document.getElementById('nav-arrow-left');
    var rightArrow = document.getElementById('nav-arrow-right');
    if (!leftArrow || !rightArrow || !cloudAreaEl) return;

    var hp = document.getElementById('homepage');
    var viewW = hp ? hp.clientWidth : window.innerWidth;
    var cloudW = cloudAreaEl.offsetWidth * zoomLevel;
    var minTx = Math.min(0, viewW - cloudW);

    leftArrow.hidden = (zoomTx >= -50);
    rightArrow.hidden = (zoomTx <= minTx + 50);
}

async function fetchData() {
    let allObjects = [];
    let page = 1;
    while (page < 9) {
        const URL = apiBase + '&page=' + page;
        try {
            const response = await fetch(URL);
            const jsonData = await response.json();
            if (jsonData.records == null) return allObjects.flat();
            allObjects.push(jsonData.records);
            page += 1;
        } catch (error) {
            break;
        }
    }
    return allObjects.flat();
}

function buildObjectList(records) {
    return records.map(record => {
        let title = record._primaryTitle ? record._primaryTitle + (record.objectType ? ' (' + record.objectType + ')' : '') : record.objectType || 'Untitled';
        return {
            systemNumber: record.systemNumber,
            objectType: record.objectType,
            title: title,
            displayName: record._primaryTitle || record.objectType || 'Untitled',
            imageId: record._primaryImageId,
            date: record._primaryDate,
            place: record._primaryPlace,
            maker: record._primaryMaker ? record._primaryMaker.name : '',
            specificLabel: null,
            cluster: null,
            material: null,
            apiMaterial: null
        };
    });
}

function renderFilterButtons(container, mode) {
    if (!container) return;
    container.innerHTML = '';
    var labels = mode == 'category' ? clusterLabels : materialFilterLabels;
    var displayNames = mode == 'category' ? clusterDisplayNames : materialDisplayNames;

    labels.forEach(label => {
        var btn = document.createElement('button');
        btn.textContent = displayNames[label];
        btn.dataset.value = label;
        btn.dataset.mode = mode;
        btn.setAttribute('aria-pressed', 'false');
        btn.disabled = true;
        btn.title = LOADING_TOOLTIP;

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
                    if (btnCategory) btnCategory.setAttribute('aria-pressed', 'true');
                    if (btnMaterial) btnMaterial.setAttribute('aria-pressed', 'false');
                } else {
                    if (btnMaterial) btnMaterial.setAttribute('aria-pressed', 'true');
                    if (btnCategory) btnCategory.setAttribute('aria-pressed', 'false');
                }
            }

            scrollToCloud(key);
            document.querySelectorAll('#controls-bar button').forEach(b => {
                if (b.dataset.value) b.setAttribute('aria-pressed', b.dataset.value == activeGroup ? 'true' : 'false');
            });
        });

        li.appendChild(btn);
        container.appendChild(li);
    });
}

function updateResultsStatus(message) {
    let status = document.getElementById('results-status');
    if (status != null) {
        status.textContent = message;
    }
}

function getGroupKeys() {
    return groupingMode == 'category' ? clusterLabels : materialFilterLabels;
}

function getGroupDisplayName(key) {
    return groupingMode == 'category' ? clusterDisplayNames[key] || key : materialDisplayNames[key] || key;
}

function getObjectGroupKey(obj) {
    return groupingMode == 'category' ? obj.cluster : obj.material;
}

function calculateClusterCenters(mode) {
    clusterCenters = {};
    var keys = mode == 'category' ? clusterLabels : materialFilterLabels;
    var countPerKey = {};
    currentObjectList.forEach(obj => {
        var groupKey = mode == 'category' ? obj.cluster : obj.material;
        if (groupKey != null) countPerKey[groupKey] = (countPerKey[groupKey] || 0) + 1;
    });

    var hp = document.getElementById('homepage');
    if (!hp) return;

    var cloudHeight = hp.clientHeight; 
    var centerY = cloudHeight / 2; // Precise mathematical center
    var cursorX = 80; 
    var gapW = 150; 

    keys.forEach(key => {
        var count = countPerKey[key] || 0;
        var clusterRadius = Math.max(60, Math.round(cardHalfSize * Math.sqrt(count)));
        clusterCenters[key] = { x: cursorX + clusterRadius, y: centerY };
        cursorX += clusterRadius * 2 + gapW;
    });

    if (cloudAreaEl) {
        cloudAreaEl.style.height = cloudHeight + 'px';
        cloudAreaEl.style.width = (cursorX + 80) + 'px';
    }
    updateNavArrows();
}

function repositionLabels() {
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';
    getGroupKeys().forEach(key => {
        var center = clusterCenters[key];
        var sec = cloudAreaEl ? cloudAreaEl.querySelector('section[' + dataAttr + '="' + key + '"]') : null;
        if (center && sec) {
            sec.style.left = (center.x - sec.offsetWidth / 2) + 'px';
            sec.style.top = (center.y - 70) + 'px';
        }
    });
}

function updateCardSize() {
    var sample = document.querySelector('article');
    cardHalfSize = (sample && sample.offsetWidth > 0) ? Math.round(sample.offsetWidth / 2) : Math.round(Math.min(28, Math.max(14, window.innerWidth * 0.02)) / 2);
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
    if (physicsSettled) return;
    var strength = 0.0002;
    var deadZone = Math.max(60, cardHalfSize * 4);
    for (var sysNum in physicsBodies) {
        var body = physicsBodies[sysNum];
        var obj = objLookup[sysNum];
        var groupKey = obj ? getObjectGroupKey(obj) : null;
        var center = clusterCenters[groupKey];
        if (center) {
            var dx = center.x - body.position.x;
            var dy = center.y - body.position.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > deadZone) Matter.Body.applyForce(body, body.position, { x: dx * strength, y: dy * strength });
        }
    }
}

function settlePhysics() {
    physicsSettled = true;
    var clusterBodies = {};
    for (var sysNum in physicsBodies) {
        var obj = objLookup[sysNum];
        var groupKey = obj ? getObjectGroupKey(obj) : null;
        var card = cardMap[sysNum];
        if (groupKey && card && card.style.display != 'none') {
            (clusterBodies[groupKey] = clusterBodies[groupKey] || []).push(sysNum);
        }
    }

    var goldenAngle = 2.39996;
    for (var key in clusterBodies) {
        var center = clusterCenters[key];
        if (center) {
            clusterBodies[key].forEach((sysNum, i) => {
                var body = physicsBodies[sysNum];
                var angle = i * goldenAngle;
                var radius = cardHalfSize * Math.sqrt(i);
                Matter.Body.setPosition(body, { x: center.x + Math.cos(angle) * radius, y: Math.max(cardHalfSize, center.y + Math.sin(angle) * radius) });
                Matter.Body.setStatic(body, true);
            });
        }
    }
    if (!scrollHintShown) {
        scrollHintShown = true;
        var hint = document.getElementById('scroll-hint');
        if (hint) hint.hidden = false;
    }
}

function startRenderLoop() {
    function tick() {
        for (var sysNum in physicsBodies) {
            var body = physicsBodies[sysNum];
            var card = cardMap[sysNum];
            if (card) {
                card.style.left = (body.position.x - cardHalfSize) + 'px';
                card.style.top = (Math.max(cardHalfSize, body.position.y) - cardHalfSize) + 'px';
            }
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function spawnCardBody(obj) {
    if (!physicsEngine || !clusterCenters[getObjectGroupKey(obj)]) return;
    var center = clusterCenters[getObjectGroupKey(obj)];
    var spread = Math.max(60, cardHalfSize * 6);
    var body = Matter.Bodies.circle(center.x + (Math.random() - 0.5) * spread, Math.max(cardHalfSize + 5, center.y + (Math.random() - 0.5) * spread), cardHalfSize + 2, {
        label: obj.systemNumber, restitution: 0.05, friction: 0.1, frictionAir: 0.35
    });
    Matter.World.add(physicsEngine.world, body);
    physicsBodies[obj.systemNumber] = body;
}

function renderClouds() {
    if (scrollMode != 'normal') resetTransform();
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';
    physicsSettled = false;

    if (physicsEngine) Matter.World.remove(physicsEngine.world, Object.values(physicsBodies));
    physicsBodies = {};
    if (cloudAreaEl) cloudAreaEl.innerHTML = '';

    calculateClusterCenters(groupingMode);

    getGroupKeys().forEach(key => {
        var center = clusterCenters[key];
        var sec = document.createElement('section');
        sec.setAttribute(dataAttr, key);
        var heading = document.createElement('h2');
        heading.textContent = getGroupDisplayName(key);
        sec.appendChild(heading);
        cloudAreaEl.appendChild(sec);
        sec.style.left = (center.x - sec.offsetWidth / 2) + 'px';
        sec.style.top = (center.y - 70) + 'px';
        sec.style.zIndex = '15';
    });

    currentObjectList.forEach(obj => {
        if (getObjectGroupKey(obj) && cardMap[obj.systemNumber]) {
            var card = cardMap[obj.systemNumber];
            var h3 = card.querySelector('h3');
            if (h3) h3.textContent = buildHoverText(obj);
            cloudAreaEl.appendChild(card);
            spawnCardBody(obj);
        }
    });
    activeGroup = null;
}

function scrollToCloud(key) {
    var dataAttr = groupingMode == 'category' ? 'data-cluster' : 'data-material';
    var target = cloudAreaEl ? cloudAreaEl.querySelector('section[' + dataAttr + '="' + key + '"]') : null;
    if (cloudAreaEl) cloudAreaEl.querySelectorAll('section[' + dataAttr + ']').forEach(s => s.removeAttribute('data-active'));
    if (!target) return;
    if (activeGroup == key) { activeGroup = null; return; }
    activeGroup = key;
    target.setAttribute('data-active', 'true');
    target.scrollIntoView({ block: 'center', inline: 'center' });
}

function applySearch() {
    currentObjectList.forEach(obj => {
        var card = cardMap[obj.systemNumber];
        if (!card) return;
        var typeMatch = searchTypeText == '' || [obj.displayName, obj.specificLabel, obj.objectType].some(s => s && s.toLowerCase().includes(searchTypeText));
        var matMatch = searchMatText == '' || [obj.material, obj.apiMaterial].some(s => s && s.toLowerCase().includes(searchMatText));
        var visible = typeMatch && matMatch;
        card.style.display = visible ? '' : 'none';
        if (physicsBodies[obj.systemNumber]) Matter.Body.setStatic(physicsBodies[obj.systemNumber], !visible);
    });
}

function setupFilters(catOpt, matOpt, searchT, searchM) {
    renderFilterButtons(catOpt, 'category');
    renderFilterButtons(matOpt, 'material');

    var btnCategory = document.getElementById('btn-category');
    var btnMaterial = document.getElementById('btn-material');

    if (btnCategory) {
        btnCategory.disabled = true;
        btnCategory.title = LOADING_TOOLTIP;
        btnCategory.addEventListener('click', () => { groupingMode = 'category'; btnCategory.setAttribute('aria-pressed', 'true'); if (btnMaterial) btnMaterial.setAttribute('aria-pressed', 'false'); renderClouds(); if (settleTimer) clearTimeout(settleTimer); settleTimer = setTimeout(settlePhysics, 4000); });
    }
    if (btnMaterial) {
        btnMaterial.disabled = true;
        btnMaterial.title = LOADING_TOOLTIP;
        btnMaterial.addEventListener('click', () => { groupingMode = 'material'; btnMaterial.setAttribute('aria-pressed', 'true'); if (btnCategory) btnCategory.setAttribute('aria-pressed', 'false'); renderClouds(); if (settleTimer) clearTimeout(settleTimer); settleTimer = setTimeout(settlePhysics, 4000); });
    }

    if (searchT) searchT.addEventListener('input', () => { searchTypeText = searchT.value.toLowerCase(); applySearch(); });
    if (searchM) searchM.addEventListener('input', () => { searchMatText = searchM.value.toLowerCase(); applySearch(); });
}

function mapSpecificToCluster(specificLabel) {
    const mappings = {
        'a toy vehicle or mechanical toy': ["a toy car", "a toy plane", "a toy train", "a toy boat", "a toy truck", "a toy tractor", "a clockwork toy", "a pull-along toy", "a ride-on toy"],
        'a doll': ["a doll", "a baby doll", "a fashion doll", "a paper doll", "a porcelain doll", "a rag doll", "a character doll"],
        'a soft toy or teddy bear': ["a teddy bear", "a soft toy", "a stuffed animal", "a soft character toy", "a plush toy"],
        'an action figure or toy soldier': ["an action figure", "a toy soldier"],
        'a puppet or marionette': ["a puppet", "a marionette"],
        'a game or puzzle': ["a board game", "a jigsaw puzzle", "a card game"],
        'a dolls house or miniature room': ["a dolls house", "a miniature room", "dolls house furniture"],
        'doll clothing or doll accessories': ["doll clothing", "doll accessories"]
    };
    for (let key in mappings) if (mappings[key].includes(specificLabel)) return key;
    return 'a toy';
}

function mapSpecificToMaterial(label) {
    const mappings = {
        'a plastic toy': ["a celluloid toy", "a hard plastic toy", "a soft plastic or vinyl toy"],
        'a wooden toy': ["a painted wooden toy", "a plain wooden toy"],
        'a metal toy': ["a tin toy", "a cast iron toy", "a wire or metal toy"],
        'a fabric or cloth toy': ["a felt toy", "a knitted or wool toy", "a cotton or cloth toy", "a silk or satin toy"],
        'a paper toy': ["a papier-mache toy", "a cardboard toy"],
        'a ceramic or porcelain toy': ["a bisque porcelain toy", "a glazed ceramic toy"]
    };
    for (let key in mappings) if (mappings[key].includes(label)) return key;
    return label;
}

function mapObjectTypeToCluster(type) {
    if (!type) return 'a toy';
    type = type.toLowerCase();
    if (type.includes('house')) return 'a dolls house or miniature room';
    if (type.includes('clothing') || type.includes('accessor')) return 'doll clothing or doll accessories';
    if (type.includes('doll') || type.includes('bisque')) return 'a doll';
    if (type.includes('teddy') || type.includes('soft toy')) return 'a soft toy or teddy bear';
    if (type.includes('puppet') || type.includes('marionette')) return 'a puppet or marionette';
    if (type.includes('soldier') || type.includes('action figure') || type == 'figure') return 'an action figure or toy soldier';
    if (['car', 'vehicle', 'pull-along', 'clockwork', 'mechanical'].some(s => type.includes(s))) return 'a toy vehicle or mechanical toy';
    if (type.includes('puzzle') || type.includes('game')) return 'a game or puzzle';
    return 'a toy';
}

function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function applyObjectTypeMapping(objectList) {
    objectList.forEach(obj => obj.cluster = mapObjectTypeToCluster(obj.objectType));
}

function saveCache(objectList) {
    let cache = {};
    objectList.forEach(obj => cache[obj.systemNumber] = { specificLabel: obj.specificLabel, cluster: obj.cluster, material: obj.material, apiMaterial: obj.apiMaterial });
    localStorage.setItem(cacheKey, JSON.stringify(cache));
}

function applyCache(objectList, cache) {
    objectList.forEach(obj => {
        let cached = cache[obj.systemNumber];
        if (cached) Object.assign(obj, cached);
    });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function movePreClustered(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        moveCardToCloud(objectList[i]);
        updateResultsStatus('Loading pre-classified objects: ' + (i + 1) + ' / ' + objectList.length);
        await delay(30);
    }
}

async function fetchPreClusters() {
    try {
        let response = await fetch('clusters.json');
        return response.ok ? await response.json() : null;
    } catch (e) { return null; }
}

async function fetchObjectMaterial(sysNum) {
    try {
        var res = await fetch('https://api.vam.ac.uk/v2/object/' + sysNum);
        if (!res.ok) return null;
        var data = await res.json();
        var record = data.record;
        if (record && record.materials) {
            if (typeof record.materials === 'string') return record.materials;
            if (Array.isArray(record.materials) && record.materials.length > 0) return typeof record.materials[0] === 'string' ? record.materials[0] : record.materials[0].text;
        }
        return record ? record.materialsAndTechniques : null;
    } catch (e) { return null; }
}

async function fetchApiMaterials(objectList) {
    for (var i = 0; i < objectList.length; i++) {
        updateResultsStatus('Fetching material data: ' + (i + 1) + ' / ' + objectList.length);
        objectList[i].apiMaterial = await fetchObjectMaterial(objectList[i].systemNumber);
    }
}

async function classifyAll(objectList) {
    var progressBar = document.getElementById('model-progress');
    var progressCallback = info => {
        if (info.status === 'progress' && progressBar) {
            progressBar.value = info.progress;
            // Removed text update as per request
        }
        if (info.status === 'ready' && progressBar) {
            progressBar.value = 100;
        }
    };

    for (var i = 0; i < objectList.length; i++) {
        var obj = objectList[i];
        var card = cardMap[obj.systemNumber];
        if (card) card.setAttribute('data-classifying', 'true');
        updateResultsStatus('AI classifying (' + (i + 1) + '/' + objectList.length + '): ' + obj.displayName);

        var typeConfidence = 0;
        var matConfidence = 0;
        var specificMat = 'unrecognised';

        try {
            var result = await classifyImage(imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg", specificTypeLabels, specificMaterialLabels, progressCallback);
            obj.specificLabel = result.specificLabel;
            obj.cluster = mapSpecificToCluster(result.specificLabel);
            specificMat = result.material;
            obj.material = mapSpecificToMaterial(specificMat);
            typeConfidence = result.typeScore || 0;
            matConfidence = result.materialScore || 0;
        } catch (e) { console.error(e); }

        if (card) card.removeAttribute('data-classifying');

        // Restore AI Log population
        var logList = document.getElementById('ai-log');
        if (logList != null) {
            var clusterName = clusterDisplayNames[obj.cluster] || obj.cluster || 'Unclassified';
            var matClusterName = materialDisplayNames[obj.material] || obj.material || 'Unknown';
            var logItem = document.createElement('li');
            logItem.innerHTML = 
                '<span class="ai-log-name">' + obj.displayName + '</span>' +
                '<span class="ai-log-api">API object type: ' + (obj.objectType || 'unknown') + '</span>' +
                '<span class="ai-log-api">API material: ' + (obj.apiMaterial || 'not available') + '</span>' +
                '<span class="ai-log-ai">AI object label: ' + (obj.specificLabel || 'unrecognised') + ' - ' + clusterName + ' (' + Math.round(typeConfidence * 100) + '% confidence)</span>' +
                '<span class="ai-log-material">AI material label: ' + (specificMat || 'unrecognised') + ' - ' + matClusterName + ' (' + Math.round(matConfidence * 100) + '% confidence)</span>';
            logList.appendChild(logItem);
            logItem.scrollIntoView({ block: 'nearest' });
        }

        moveCardToCloud(obj);
        saveCache(currentObjectList);

        var remaining = objectList.length - (i + 1);
        var panelTitle = document.getElementById('ai-panel-title');
        if (panelTitle) panelTitle.textContent = remaining > 0 ? 'Items to be classified (' + remaining + ')' : 'All items classified';
        await delay(600);
    }
}

function createCard(obj) {
    const card = document.createElement('article');
    card.setAttribute('aria-label', obj.title);
    card.setAttribute('tabindex', '-1');
    card.dataset.id = obj.systemNumber;
    card.innerHTML = '<h3>' + obj.title + '</h3><picture><img src="' + imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg" + '" alt="" width="400" height="400" loading="lazy"></picture>';
    card.onclick = () => window.location.href = 'details.html?id=' + obj.systemNumber + '&img=' + encodeURIComponent(obj.imageId) + '&title=' + encodeURIComponent(obj.displayName);
    card.onkeydown = e => { if (e.key == 'Enter' || e.key == ' ') { e.preventDefault(); card.click(); } };
    return card;
}

function renderPendingSection(unclassified, allObjects) {
    allObjects.forEach(obj => { if (!cardMap[obj.systemNumber]) cardMap[obj.systemNumber] = createCard(obj); });
    if (unclassified.length == 0) return;

    pendingEl = document.createElement('aside');
    pendingEl.id = 'ai-panel';
    pendingEl.innerHTML = '<header id="ai-panel-header"><h2 id="ai-panel-title">Items to be classified (' + unclassified.length + ')</h2><button id="ai-panel-close" aria-label="Close AI classification panel">x</button></header>';
    pendingEl.querySelector('#ai-panel-close').onclick = () => { if (pendingEl && pendingEl.parentNode) pendingEl.parentNode.removeChild(pendingEl); pendingEl = null; };

    var cardGrid = document.createElement('section');
    cardGrid.id = 'ai-pending-cards';
    unclassified.forEach(obj => cardGrid.appendChild(cardMap[obj.systemNumber]));
    pendingEl.appendChild(cardGrid);

    var log = document.createElement('ul');
    log.id = 'ai-log';
    pendingEl.appendChild(log);
    document.querySelector('main').appendChild(pendingEl);
}

function buildHoverText(obj) {
    return [obj.title, obj.specificLabel, clusterDisplayNames[obj.cluster]].filter(Boolean).join(' | ');
}

function moveCardToCloud(obj) {
    var card = cardMap[obj.systemNumber];
    if (!card) return;
    var h3 = card.querySelector('h3');
    if (h3) h3.textContent = buildHoverText(obj);
    if (card.parentNode != cloudAreaEl) {
        card.style.position = 'absolute';
        card.style.left = '-9999px';
        card.style.top = '-9999px';
        if (cloudAreaEl) cloudAreaEl.appendChild(card);
    }
    if (physicsBodies[obj.systemNumber]) Matter.World.remove(physicsEngine.world, physicsBodies[obj.systemNumber]);
    spawnCardBody(obj);
}

function clampPanX() {
    if (!cloudAreaEl) return;
    var hp = document.getElementById('homepage');
    var viewW = hp ? hp.clientWidth : window.innerWidth;
    var cloudW = cloudAreaEl.offsetWidth * zoomLevel;
    zoomTx = Math.max(Math.min(0, viewW - cloudW), Math.min(0, zoomTx));
}

function applyCurrentTransform() {
    if (cloudAreaEl) { 
        cloudAreaEl.style.transformOrigin = '0 0'; 
        cloudAreaEl.style.transform = 'translate(' + zoomTx + 'px, ' + zoomTy + 'px) scale(' + zoomLevel + ')'; 
        updateNavArrows();
    }
}

function initCloudBasePosition() {
    var el = cloudAreaEl, x = 0, y = 0;
    while (el) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    cloudBaseX = x; cloudBaseY = y;
}

function getCloudViewX() { return cloudBaseX - window.scrollX; }
function getCloudViewY() { return cloudBaseY - window.scrollY; }

function getActiveClusterKeys() {
    var keys = getGroupKeys(), active = [];
    keys.forEach(k => { if (currentObjectList.some(obj => getObjectGroupKey(obj) == k)) active.push(k); });
    return active;
}

function applyZoom(newScale) {
    var mxRel = mouseClientX - getCloudViewX(), myRel = mouseClientY - getCloudViewY();
    var ratio = newScale / zoomLevel;
    zoomTx = mxRel * (1 - ratio) + zoomTx * ratio;
    zoomTy = myRel * (1 - ratio) + zoomTy * ratio;
    zoomLevel = newScale;
    clampPanX();
    applyCurrentTransform();
}

function getFocusScale(key) {
    var count = currentObjectList.filter(obj => getObjectGroupKey(obj) == key).length;
    var radius = Math.max(60, cardHalfSize * Math.sqrt(count));
    var sec = document.getElementById('homepage');
    return Math.min(8, Math.max(1.5, Math.min(sec.offsetWidth, window.innerHeight) * 0.45 / radius));
}

function applyFocusState() {
    if (focusKeys.length == 0) return;
    var key = focusKeys[focusClusterIndex], center = clusterCenters[key], scale = getFocusScale(key);
    var sec = document.getElementById('homepage'), sectionTop = Math.max(0, sec.getBoundingClientRect().top);
    var viewCenterX = window.innerWidth / 2, viewCenterY = sectionTop + (window.innerHeight - sectionTop) / 2;
    var tx = viewCenterX - getCloudViewX() - center.x * scale - (focusScrollAcc / FOCUS_SCROLL_THRESHOLD) * window.innerWidth;
    var ty = viewCenterY - getCloudViewY() - center.y * scale;
    if (cloudAreaEl) { cloudAreaEl.style.transformOrigin = '0 0'; cloudAreaEl.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')'; }
}

function resetTransform() {
    scrollMode = 'normal'; zoomLevel = 1; zoomTx = 0; zoomTy = 0; focusScrollAcc = 0; focusClusterIndex = 0; focusKeys = [];
    if (cloudAreaEl) { cloudAreaEl.style.transform = ''; cloudAreaEl.style.transformOrigin = ''; }
    updateClusterTabFocus();
    updateNavArrows();
}

function handleWheel(e) {
    var sec = document.getElementById('homepage'), rect = sec.getBoundingClientRect();
    if (mouseClientX < rect.left || mouseClientX > rect.right || mouseClientY < rect.top || mouseClientY > rect.bottom) return;
    var dx = e.deltaMode == 1 ? e.deltaX * 20 : (e.deltaMode == 2 ? e.deltaX * window.innerWidth : e.deltaX);
    var dy = e.deltaMode == 1 ? e.deltaY * 20 : (e.deltaMode == 2 ? e.deltaY * window.innerHeight : e.deltaY);
    if (scrollMode != 'focus' && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); zoomTx -= dx; clampPanX(); applyCurrentTransform(); return; }
    if (!physicsSettled) return;
    var hint = document.getElementById('scroll-hint'); if (hint) hint.hidden = true;
    if (scrollMode == 'normal') {
        if (dy < 0) { e.preventDefault(); scrollMode = 'zoom'; applyZoom(Math.min(zoomLevel + Math.min(Math.abs(dy) * 0.0015, 0.3), 6)); }
        else if (dy > 0) { e.preventDefault(); focusKeys = getActiveClusterKeys(); if (focusKeys.length) { scrollMode = 'focus'; focusClusterIndex = 0; focusScrollAcc = 0; applyFocusState(); announceCluster(); } }
    } else if (scrollMode == 'zoom') {
        e.preventDefault(); var inc = Math.min(Math.abs(dy) * 0.0015, 0.3);
        if (dy > 0) { var ns = Math.max(1, zoomLevel - inc); if (ns <= 1) resetTransform(); else applyZoom(ns); }
        else applyZoom(Math.min(zoomLevel + inc, 6));
    } else if (scrollMode == 'focus') {
        e.preventDefault(); if (dy < 0) { resetTransform(); return; }
        focusScrollAcc += dy;
        if (focusScrollAcc >= FOCUS_SCROLL_THRESHOLD) {
            focusClusterIndex++; focusScrollAcc -= FOCUS_SCROLL_THRESHOLD;
            if (focusClusterIndex >= focusKeys.length) { resetTransform(); return; }
            announceCluster();
        }
        applyFocusState();
    }
}

function updateClusterTabFocus() {
    var activeKey = (scrollMode == 'focus' && focusClusterIndex < focusKeys.length) ? focusKeys[focusClusterIndex] : null;
    currentObjectList.forEach(obj => { if (cardMap[obj.systemNumber]) cardMap[obj.systemNumber].setAttribute('tabindex', getObjectGroupKey(obj) == activeKey ? '0' : '-1'); });
}

function announceCluster() {
    var ann = document.getElementById('cluster-announce');
    if (ann) ann.textContent = (scrollMode == 'focus' && focusClusterIndex < focusKeys.length) ? getGroupDisplayName(focusKeys[focusClusterIndex]) + ' cluster, ' + (focusClusterIndex + 1) + ' of ' + focusKeys.length : 'Overview';
    updateClusterTabFocus();
}

function handleKeyDown(e) {
    if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key == 'ArrowLeft' || e.key == 'ArrowRight') { if (scrollMode != 'focus') { e.preventDefault(); zoomTx += e.key == 'ArrowLeft' ? 200 : -200; clampPanX(); applyCurrentTransform(); } return; }
    if (!physicsSettled) return;
    if (e.key == 'Escape') { if (scrollMode != 'normal') { e.preventDefault(); resetTransform(); announceCluster(); } return; }
    if (e.key == 'ArrowDown') { e.preventDefault(); var h = document.getElementById('scroll-hint'); if (h) h.hidden = true; if (scrollMode == 'normal') { focusKeys = getActiveClusterKeys(); if (focusKeys.length) { scrollMode = 'focus'; focusClusterIndex = 0; focusScrollAcc = 0; applyFocusState(); announceCluster(); } } else if (scrollMode == 'focus') { focusClusterIndex++; focusScrollAcc = 0; if (focusClusterIndex >= focusKeys.length) { resetTransform(); announceCluster(); } else { applyFocusState(); announceCluster(); } } return; }
    if (e.key == 'ArrowUp') { e.preventDefault(); if (scrollMode == 'focus') { if (focusClusterIndex > 0) { focusClusterIndex--; focusScrollAcc = 0; applyFocusState(); announceCluster(); } else { resetTransform(); announceCluster(); } } return; }
}

function setupScrollInteraction() {
    document.addEventListener('mousemove', e => {
        mouseClientX = e.clientX;
        mouseClientY = e.clientY;
        if (isDragging && scrollMode != 'focus') {
            zoomTx = dragStartTx + (e.clientX - dragStartX);
            clampPanX();
            applyCurrentTransform();
        }
    });

    document.addEventListener('mousedown', e => {
        var isBackground = e.target.id === 'homepage' || e.target.dataset.cloudArea === 'true' || e.target.tagName === 'SECTION';
        var canDrag = (e.button === 0 && isBackground);
        if (canDrag && scrollMode != 'focus') {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartTx = zoomTx;
            document.body.classList.add('is-dragging');
        }
    });

    document.addEventListener('mouseup', () => { isDragging = false; document.body.classList.remove('is-dragging'); });
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', () => { initCloudBasePosition(); calculateClusterCenters(groupingMode); repositionLabels(); });
    initCloudBasePosition();
}

async function displayObjects() {
    const mainEl = document.getElementById('homepage');
    
    // Show loading popup immediately (non-modal)
    var loadPopup = document.getElementById('loading-popup');
    if (loadPopup) {
        loadPopup.show();
        var loadClose = document.getElementById('loading-popup-close');
        if (loadClose) loadClose.addEventListener('click', () => loadPopup.close());
    }

    const records = await fetchData();
    const objectList = buildObjectList(records);
    shuffleArray(objectList);
    currentObjectList = objectList;
    objectList.forEach(obj => objLookup[obj.systemNumber] = obj);

    setupFilters(document.getElementById('filter-category-options'), document.getElementById('filter-material-options'), document.getElementById('filter-search-type'), document.getElementById('filter-search-mat'));

    cloudAreaEl = document.createElement('section');
    cloudAreaEl.setAttribute('data-cloud-area', 'true');
    if (mainEl) mainEl.appendChild(cloudAreaEl);

    initPhysics(); startRenderLoop(); renderClouds(); setupScrollInteraction();
    applyObjectTypeMapping(objectList);

    let pre = await fetchPreClusters();
    if (pre) { applyCache(objectList, pre); calculateClusterCenters(groupingMode); repositionLabels(); }

    let preclustered = objectList.filter(o => o.specificLabel != null), unclassified = objectList.filter(o => o.specificLabel == null);
    renderPendingSection(unclassified, objectList);
    updateCardSize();

    var modelProgWrap = document.getElementById('model-progress-wrap');
    if (modelProgWrap) modelProgWrap.classList.remove('sr-only');

    await Promise.all([movePreClustered(preclustered), unclassified.length ? fetchApiMaterials(unclassified) : Promise.resolve()]);

    if (unclassified.length) {
        updateResultsStatus('Initializing collection...'); 
        let start = Date.now(); await classifyAll(unclassified);
        console.log('AI done. Time: ' + ((Date.now() - start) / 1000).toFixed(1) + 's');
    }

    saveCache(objectList);
    updateResultsStatus('All ' + objectList.length + ' objects clustered. Ready to explore.');
    settlePhysics();
    
    if (modelProgWrap) modelProgWrap.classList.add('completely-hidden');
    if (loadPopup && loadPopup.open) loadPopup.close();

    // Enable all filter buttons
    document.querySelectorAll('#controls-bar button').forEach(btn => {
        btn.disabled = false;
        btn.removeAttribute('title');
    });

    var readyPopup = document.getElementById('ready-popup');
    if (readyPopup) {
        readyPopup.show();
        var readyClose = document.getElementById('ready-popup-close');
        if (readyClose) readyClose.addEventListener('click', () => readyPopup.close());
    }
}

displayObjects();
