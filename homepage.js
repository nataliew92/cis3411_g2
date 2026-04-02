const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=100&data_restrict=descriptive_only";
const imageUrl = "https://framemark.vam.ac.uk/collections";
const main = document.getElementById('homepage');

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
            cluster: null
        };

        objectList.push(obj);
    }
    return objectList;
}

async function displayObjects() {
    const records = await fetchData();
    const objectList = buildObjectList(records);

    console.log('Total objects:', objectList.length);
    console.log('Sample object:', objectList[0]);

    for (let i = 0; i < objectList.length; i++) {
        let obj = objectList[i];
        const card = document.createElement('article');

        const imgSrc = imageUrl + "/" + obj.imageId + "/full/!400,400/0/default.jpg";

        card.innerHTML =
            '<h2>' + obj.title + '</h2>' +
            '<picture>' +
                '<img src="' + imgSrc + '" alt="" width="400" height="400" loading="lazy">' +
            '</picture>';

        main.appendChild(card);
    }
}

displayObjects();
