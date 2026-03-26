const apiBase = "https://api.vam.ac.uk/v2/objects/search?id_category=THES48967&id_collection=THES48593&images_exist=1&page_size=100&data_restrict=descriptive_only";

async function fetchData() {
    while (page < 11) {
        const URL = apiBase + '&page=' + page;
        try {
            const response = await fetch(URL);
            const jsonData = await response.json();
            if (jsonData.records == null) {
                return [];
            }
            console.log(jsonData.records);
            return jsonData.records;
        } catch (error) {
            return [];
        }
    }
    
}