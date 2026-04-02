const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=100&data_restrict=descriptive_only";
const imageUrl = "https://framemark.vam.ac.uk/collections";
const main = document.getElementById('homepage');

async function fetchData() {
    let allObjects =[];
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
    const objectList = allObjects.flat();
    console.log('Sample object:', objectList[0]);
    return objectList;
    
}

async function displayObjects() {
    const objectList = await fetchData();
    objectList.forEach(object => {
        const card = document.createElement('article');
        
        /*title*/
        let title = '';
        if (object._primaryTitle && object.objectType) {
            title = object._primaryTitle + ' (' + object.objectType + ')';
        } else if (object.objectType) {
            title = object.objectType;
        } else {
            title = 'Untitled';
        }

        /*image*/
        const imgId = object._primaryImageId;
        const image = imageUrl + "/" + imgId + "/full/!400,400/0/default.jpg";

        /*Adding to the HTML*/
        card.innerHTML =
        '<h2>' + title + '</h2>' +
        '<picture>' +
            '<img src="' + image + '" alt="" width="600" height="600" loading="lazy">' +
        '</picture>';

        main.appendChild(card);

        /* Data stored for clustering - TODO */


    });
}

displayObjects();