import { classifyImageType, classifyImageMaterial } from './homepage_model.js';


const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=10&data_restrict=descriptive_only";
const imageUrl = "https://framemark.vam.ac.uk/collections";
const main = document.getElementById('homepage');
const cacheKey = "va_cluster_cache";

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
            cluster: null,
            material: null
        };

        objectList.push(obj);
    }
    return objectList;
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

async function classifyObjects(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        let imgSrc = imageUrl + "/" + objectList[i].imageId + "/full/!400,400/0/default.jpg";
        try {
            objectList[i].cluster = await classifyImageType(imgSrc);
        } catch (error) {
            console.error('Type classification error:', error);
        }
        console.log('Type ' + (i + 1) + ' / ' + objectList.length + ': ' + objectList[i].cluster);
    }
}

async function classifyMaterials(objectList) {
    for (let i = 0; i < objectList.length; i++) {
        let imgSrc = imageUrl + "/" + objectList[i].imageId + "/full/!400,400/0/default.jpg";
        try {
            objectList[i].material = await classifyImageMaterial(imgSrc);
        } catch (error) {
            console.error('Material classification error:', error);
            objectList[i].material = 'unknown';
        }
        console.log('Material ' + (i + 1) + ' / ' + objectList.length + ': ' + objectList[i].material);
    }
}

function renderCards(objectList) {
    main.innerHTML = '';
    for (let i = 0; i < objectList.length; i++) {
        let obj = objectList[i];
        const card = document.createElement('article');
        const imgSrc = imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg";

        card.innerHTML =
            '<h2>' + obj.title + '</h2>' +
            '<picture>' +
                '<img src="' + imgSrc + '" alt="" width="400" height="400" loading="lazy">' +
            '</picture>' +
            '<p>' + obj.cluster + '</p>';

        main.appendChild(card);
    }
}

async function displayObjects() {
    const records = await fetchData();
    const objectList = buildObjectList(records);

    const cache = loadCache();
    if (cache != null) {
        console.log('Using cached labels');
        applyCache(objectList, cache);
        renderCards(objectList);
    } else {
        applyObjectTypeMapping(objectList);
        renderCards(objectList);
        console.log('Running AI type classification in background...');
        await classifyObjects(objectList);
        renderCards(objectList);
        console.log('Running material classification in background...');
        await classifyMaterials(objectList);
        saveCache(objectList);
        console.log('All done — results cached');
    }
}

displayObjects();
