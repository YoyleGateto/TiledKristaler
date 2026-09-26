const fileInput = document.getElementById('fileInput');
const xmlInput = document.getElementById('xmlInput');
const output = document.getElementById('output');
const btnConvert = document.getElementById('btnConvert');
const btnCopy = document.getElementById('btnCopy');
const btnDownload = document.getElementById('btnDownload');
const statusMsg = document.getElementById('statusMsg');

let currentFileName = 'map.lua';

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    currentFileName = baseName + '.lua';

    const reader = new FileReader();
    reader.onload = (evt) => {
        xmlInput.value = evt.target.result;
    };
    reader.readAsText(file);
});

btnConvert.addEventListener('click', processConversion);

function processConversion() {
    const xmlText = xmlInput.value.trim();
    if (!xmlText) {
        statusMsg.textContent = '* You know this is empty right?';
        return;
    }

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        if (xmlDoc.querySelector('parsererror')) {
            throw new Error("Bad XMl Syntax!");
        }

        if (xmlDoc.querySelector('map')) {
            output.value = parseTMX(xmlDoc.querySelector('map'));
            statusMsg.textContent = '* Done!';
        } else if (xmlDoc.querySelector('tileset')) {
            output.value = parseTSX(xmlDoc.querySelector('tileset'));
            statusMsg.textContent = '* Done!';
        } else {
            throw new Error("Did not found map or tileset element on the xml.");
        }
    } catch (err) {
        statusMsg.textContent = `* ${err.message}`;
    }
}


function parsePropertiesNode(parent) {
    const propsNode = parent.querySelector(':scope > properties');
    if (!propsNode) return null;

    const props = {};
    propsNode.querySelectorAll(':scope > property').forEach(p => {
        const name = p.getAttribute('name');
        let val = p.getAttribute('value');

        if (val === null && p.textContent) {
            val = p.textContent;
        }

        if (!Number.isNaN(parseFloat(val))) {
            props[name] = parseFloat(val);
        } else if (val === "true" || val === "false") {
            props[name] = val === 'true';
        } else {
            props[name] = val || "";
        }
    });

    return Object.keys(props).length > 0 ? props : null;
}


function formatLuaValue(val, name, indent = 0) {
    const spaces = " ".repeat(indent);
    if (val === null || val === undefined) return "nil";
    if (typeof val === 'string') return `"${val.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    if (typeof val === 'boolean') return val ? "true" : "false";
    if (typeof val === 'number') return val.toString();

    if (Array.isArray(val)) {
        if (val.length === 0) return "{}";
        
        if (val.every(item => typeof item === 'number')) {
            return "{\n" + spaces + "  " + val.join(", ") + "\n" + spaces + "}";
        }
        const items = val.map(item => formatLuaValue(item, "", indent + 2));
        return "{\n" + spaces + "  " + items.join(",\n" + spaces + "  ") + "\n" + spaces + "}";
    }

    if (typeof val === 'object') {
        const keys = Object.keys(val);
        if (keys.length === 0) return "{}";
        const pairs = keys.map(k => {
            const luaKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : `["${k}"]`;
            if (name !== "properties")
            {
            	return `${luaKey} = ${formatLuaValue(val[k], luaKey, indent + 2)}`;
            } else {
            	return `["${luaKey}"] = ${formatLuaValue(val[k], luaKey, indent + 2)}`;
            }
        });
        return "{\n" + spaces + "  " + pairs.join(",\n" + spaces + "  ") + "\n" + spaces + "}";
    }

    return "nil";
}

function parseTMX(mapNode) {
    const mapData = {
        version: mapNode.getAttribute('version') || "1.9",
        luaversion: "5.1",
        tiledversion: mapNode.getAttribute('tiledversion') || "1.9.2",
        class: mapNode.getAttribute('class') || "",
        orientation: mapNode.getAttribute('orientation') || "orthogonal",
        renderorder: mapNode.getAttribute('renderorder') || "right-down",
        width: parseInt(mapNode.getAttribute('width') || 0),
        height: parseInt(mapNode.getAttribute('height') || 0),
        tilewidth: parseInt(mapNode.getAttribute('tilewidth') || 32),
        tileheight: parseInt(mapNode.getAttribute('tileheight') || 32),
        nextlayerid: parseInt(mapNode.getAttribute('nextlayerid') || 1),
        nextobjectid: parseInt(mapNode.getAttribute('nextobjectid') || 1),
        properties: parsePropertiesNode(mapNode) || {},
        tilesets: [],
        layers: []
    };

    
    mapNode.querySelectorAll(':scope > tileset').forEach(ts => {
        const tsData = {
            name: ts.getAttribute('name') || "",
            firstgid: parseInt(ts.getAttribute('firstgid') || 1)
        };
        if (ts.getAttribute('source')) {
            tsData.filename = ts.getAttribute('source');
        }
        mapData.tilesets.push(tsData);
    });

    
    mapNode.childNodes.forEach(child => {
        if (child.nodeType !== 1) return;

        if (child.tagName === 'layer') {
            const dataNode = child.querySelector('data');
            let rawData = [];
            if (dataNode) {
                const csvText = dataNode.textContent.trim();
                rawData = csvText.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            }

            mapData.layers.push({
                type: "tilelayer",
                x: parseInt(child.getAttribute('offsetx') || 0),
                y: parseInt(child.getAttribute('offsety') || 0),
                width: parseInt(child.getAttribute('width') || mapData.width),
                height: parseInt(child.getAttribute('height') || mapData.height),
                id: parseInt(child.getAttribute('id') || 0),
                name: child.getAttribute('name') || "",
                visible: child.getAttribute('visible') !== '0',
                opacity: parseFloat(child.getAttribute('opacity') || 100) / 100,
                offsetx: parseInt(child.getAttribute('offsetx') || 0),
                offsety: parseInt(child.getAttribute('offsety') || 0),
                properties: parsePropertiesNode(child) || {},
                encoding: "lua",
                data: rawData
            });
        } else if (child.tagName === 'imagelayer') {
        	let source = "";
        	child.childNodes.forEach(img => {
		        if (img.nodeType !== 1) return;
		
		        if (img.tagName === 'image') {
        			source = img.getAttribute("source") || "";
      		  }
        	});
            mapData.layers.push({
                type: "imagelayer",
                x: parseInt(child.getAttribute('offsetx') || 0),
                y: parseInt(child.getAttribute('offsety') || 0),
                width: parseInt(child.getAttribute('width') || mapData.width),
                height: parseInt(child.getAttribute('height') || mapData.height),
                id: parseInt(child.getAttribute('id') || 0),
                name: child.getAttribute('name') || "",
                visible: child.getAttribute('visible') !== '0',
                opacity: parseFloat(child.getAttribute('opacity') || 100) / 100,
                offsetx: parseInt(child.getAttribute('offsetx') || 0),
                offsety: parseInt(child.getAttribute('offsety') || 0),
                properties: parsePropertiesNode(child) || {},
                image: source,
                encoding: "lua",
            });
        } else if (child.tagName === 'objectgroup') {
            const objects = [];
            child.querySelectorAll(':scope > object').forEach(obj => {
                objects.push({
                    id: parseInt(obj.getAttribute('id') || 0),
                    name: obj.getAttribute('name') || "",
                    type: obj.getAttribute('type') || obj.getAttribute('class') || "",
                    shape: obj.querySelector('ellipse') ? "ellipse" : (obj.querySelector('polygon') ? "polygon" : (obj.querySelector('point') ? "point" : "rectangle")),
                    x: parseFloat(obj.getAttribute('x') || 0),
                    y: parseFloat(obj.getAttribute('y') || 0),
                    width: parseFloat(obj.getAttribute('width') || 0),
                    height: parseFloat(obj.getAttribute('height') || 0),
                    rotation: parseFloat(obj.getAttribute('rotation') || 0),
                    visible: obj.getAttribute('visible') !== '0',
                    properties: parsePropertiesNode(obj) || {}
                });
            });

            mapData.layers.push({
                type: "objectgroup",
                draworder: child.getAttribute('draworder') || "topdown",
                id: parseInt(child.getAttribute('id') || 0),
                name: child.getAttribute('name') || "",
                visible: child.getAttribute('visible') !== '0',
                opacity: parseFloat(child.getAttribute('opacity') || 1),
                offsetx: parseInt(child.getAttribute('offsetx') || 0),
                offsety: parseInt(child.getAttribute('offsety') || 0),
                properties: parsePropertiesNode(child) || {},
                objects: objects
            });
        }
    });

    return "return " + formatLuaValue(mapData, "", 0) + "\n";
}

function parseTSX(tsNode) {
    const imgNode = tsNode.querySelector('image');

    const tsData = {
        version: tsNode.getAttribute('version') || "1.9",
        luaversion: "5.1",
        tiledversion: tsNode.getAttribute('tiledversion') || "1.9.2",
        name: tsNode.getAttribute('name') || "",
        class: tsNode.getAttribute('class') || "",
        tilewidth: parseInt(tsNode.getAttribute('tilewidth') || 32),
        tileheight: parseInt(tsNode.getAttribute('tileheight') || 32),
        spacing: parseInt(tsNode.getAttribute('spacing') || 0),
        margin: parseInt(tsNode.getAttribute('margin') || 0),
        columns: parseInt(tsNode.getAttribute('columns') || 0),
        tilecount: parseInt(tsNode.getAttribute('tilecount') || 0),
        image: imgNode ? imgNode.getAttribute('source') || "" : "",
        imagewidth: imgNode ? parseInt(imgNode.getAttribute('width') || 0) : 0,
        imageheight: imgNode ? parseInt(imgNode.getAttribute('height') || 0) : 0,
        properties: parsePropertiesNode(tsNode) || {},
        tiles: []
    };

    
    tsNode.querySelectorAll(':scope > tile').forEach(t => {
        const tileObj = {
            id: parseInt(t.getAttribute('id')),
            properties: parsePropertiesNode(t) || {}
        };
        tsData.tiles.push(tileObj);
    });

    return "return " + formatLuaValue(tsData, 0) + "\n";
}


btnCopy.addEventListener('click', () => {
    if (!outputLua.value) return;
    outputLua.select();
    document.execCommand('copy');
});

btnDownload.addEventListener('click', () => {
    if (!outputLua.value) return;
    const blob = new Blob([outputLua.value], { type: 'text/x-lua' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFileName;
    a.click();
    URL.revokeObjectURL(url);
});