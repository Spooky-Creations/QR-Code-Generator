'use strict';

var currentQRCode = null;
var currentShortCode = null;
var currentRedirectUrl = null;

var body_loadHandler = function() {
  var crtOpt = function(value, label) {
    var opt = document.createElement('option');
    opt.appendChild(document.createTextNode(label));
    opt.value = value;
    return opt;
  };

  var t = document.forms['qrForm'].elements['t'];
  t.appendChild(crtOpt('0', 'Auto Detect'));
  for (var i = 1; i <= 40; i += 1) {
    t.appendChild(crtOpt('' + i, '' + i));
  }
  t.value = '0';

  document.getElementById('dataCaps').appendChild(createDataCapsTable());

  // Add input listeners for live updates
  var inputs = ['msg', 't', 'e', 'm', 'mb'];
  inputs.forEach(function(name) {
    var element = document.forms['qrForm'].elements[name];
    if (element.tagName === 'TEXTAREA') {
      element.addEventListener('input', update_qrcode);
    } else {
      element.addEventListener('change', update_qrcode);
    }
  });

  // Load dashboard on page load
  loadDashboard();
};

var create_qrcode = function(text, typeNumber, errorCorrectionLevel, mode, mb) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs[mb];

  var qr = qrcode(typeNumber || 4, errorCorrectionLevel || 'M');
  qr.addData(text, mode);
  qr.make();

  currentQRCode = qr;
  return qr.createImgTag(4, 10);
};

var update_qrcode = async function() {
  var form = document.forms['qrForm'];
  var text = form.elements['msg'].value.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
  
  if (!text) {
    document.getElementById('qr').innerHTML = '<div class="loading">Enter some content to generate a QR code...</div>';
    document.getElementById('downloadSection').style.display = 'none';
    document.getElementById('statsSection').style.display = 'none';
    return;
  }

  var useTracking = document.getElementById('useTracking').checked;
  
  // Show loading state
  document.getElementById('qr').innerHTML = '<div class="loading">Generating QR code...</div>';
  
  if (useTracking) {
    // Create trackable QR code via server
    try {
      const response = await fetch('/api/create-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: text })
      });
      
      const data = await response.json();
      
      if (data.success) {
        currentShortCode = data.shortCode;
        currentRedirectUrl = data.redirectUrl;
        
        // Generate QR code with redirect URL
        var t = form.elements['t'].value;
        var e = form.elements['e'].value;
        var m = form.elements['m'].value;
        var mb = form.elements['mb'].value;
        
        document.getElementById('qr').innerHTML = create_qrcode(data.redirectUrl, t, e, m, mb);
        document.getElementById('downloadSection').style.display = 'block';
        
        // Show stats section
        document.getElementById('statsSection').style.display = 'block';
        document.getElementById('trackingInfo').innerHTML = `
          <p><strong>Tracking URL:</strong> <a href="${data.redirectUrl}" target="_blank">${data.redirectUrl}</a></p>
          <p><strong>Original URL:</strong> ${data.originalUrl}</p>
          <p><strong>Short Code:</strong> ${data.shortCode}</p>
          <p><strong>Scans:</strong> <span id="scanCount">0</span></p>
        `;
        
        // Start polling for stats
        startStatsPolling(data.shortCode);
        
        // Reload dashboard
        loadDashboard();
      } else {
        document.getElementById('qr').innerHTML = '<div class="loading">Error creating trackable QR code</div>';
      }
    } catch (error) {
      console.error('Error:', error);
      document.getElementById('qr').innerHTML = '<div class="loading">Error connecting to server</div>';
    }
  } else {
    // Generate regular QR code (no tracking)
    var t = form.elements['t'].value;
    var e = form.elements['e'].value;
    var m = form.elements['m'].value;
    var mb = form.elements['mb'].value;
    
    document.getElementById('qr').innerHTML = create_qrcode(text, t, e, m, mb);
    document.getElementById('downloadSection').style.display = 'block';
    document.getElementById('statsSection').style.display = 'none';
    currentShortCode = null;
    currentRedirectUrl = null;
  }
};

var statsPollingInterval = null;

var startStatsPolling = function(shortCode) {
  // Clear any existing interval
  if (statsPollingInterval) {
    clearInterval(statsPollingInterval);
  }
  
  // Poll every 2 seconds
  statsPollingInterval = setInterval(async function() {
    try {
      const response = await fetch(`/api/stats/${shortCode}`);
      const data = await response.json();
      
      if (data.scanCount !== undefined) {
        document.getElementById('scanCount').textContent = data.scanCount;
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, 2000);
};

var downloadQR = function(size) {
  if (!currentQRCode) {
    alert('Please generate a QR code first!');
    return;
  }

  var moduleCount = currentQRCode.getModuleCount();
  var cellSize = Math.floor(size / moduleCount);
  
  // Calculate actual canvas size to avoid white borders
  var actualSize = cellSize * moduleCount;
  
  var canvas = document.createElement('canvas');
  canvas.width = actualSize;
  canvas.height = actualSize;
  var ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, actualSize, actualSize);

  // Draw QR code
  ctx.fillStyle = '#000000';
  for (var row = 0; row < moduleCount; row++) {
    for (var col = 0; col < moduleCount; col++) {
      if (currentQRCode.isDark(row, col)) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  // Download
  canvas.toBlob(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var filename = currentShortCode ? 
      'qrcode_tracked_' + currentShortCode + '_' + actualSize + 'x' + actualSize + '.png' :
      'qrcode_' + actualSize + 'x' + actualSize + '.png';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
};

var downloadSVG = function() {
  if (!currentQRCode) {
    alert('Please generate a QR code first!');
    return;
  }

  var svgString = currentQRCode.createSvgTag(4, 0);
  var blob = new Blob([svgString], { type: 'image/svg+xml' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var filename = currentShortCode ? 
    'qrcode_tracked_' + currentShortCode + '.svg' :
    'qrcode.svg';
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

var loadDashboard = async function() {
  try {
    const response = await fetch('/api/all-qr-codes');
    const qrCodes = await response.json();
    
    const dashboardDiv = document.getElementById('qrDashboard');
    
    if (qrCodes.length === 0) {
      dashboardDiv.innerHTML = '<p class="loading">No tracked QR codes yet. Create one above!</p>';
      return;
    }
    
    var html = '<table class="dashboard-table"><thead><tr>' +
      '<th>Short Code</th>' +
      '<th>Original URL</th>' +
      '<th>Scans</th>' +
      '<th>Created</th>' +
      '<th>Last Scanned</th>' +
      '<th>Actions</th>' +
      '</tr></thead><tbody>';
    
    qrCodes.forEach(function(qr) {
      var lastScanned = qr.last_scanned ? new Date(qr.last_scanned).toLocaleString() : 'Never';
      var created = new Date(qr.created_at).toLocaleString();
      var redirectUrl = window.location.origin + '/r/' + qr.short_code;
      
      html += '<tr>' +
        '<td><code>' + qr.short_code + '</code></td>' +
        '<td><a href="' + qr.original_url + '" target="_blank" class="url-link">' + 
        (qr.original_url.length > 40 ? qr.original_url.substring(0, 40) + '...' : qr.original_url) + 
        '</a></td>' +
        '<td><strong>' + qr.scan_count + '</strong></td>' +
        '<td>' + created + '</td>' +
        '<td>' + lastScanned + '</td>' +
        '<td>' +
        '<button class="btn-small" onclick="copyToClipboard(\'' + redirectUrl + '\')">Copy Link</button> ' +
        '<button class="btn-small btn-danger" onclick="deleteQRCode(\'' + qr.short_code + '\')">Delete</button>' +
        '</td>' +
        '</tr>';
    });
    
    html += '</tbody></table>';
    dashboardDiv.innerHTML = html;
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
};

var deleteQRCode = async function(shortCode) {
  if (!confirm('Are you sure you want to delete this QR code?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/delete-qr/${shortCode}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.success) {
      loadDashboard();
    } else {
      alert('Error deleting QR code');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error deleting QR code');
  }
};

var copyToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(function() {
    alert('Link copied to clipboard!');
  }, function() {
    alert('Failed to copy link');
  });
};

var createDataCapsTable = function() {
  var modes = ['Numeric', 'Alphanumeric', 'Byte', 'Kanji'];
  var ecls = ['L', 'M', 'Q', 'H'];
  var colors = ['255,0,0', '255,159,0', '0,255,0', '0,0,255'];
  var getCellBg = function(m, e) {
    return 'rgba(' + colors[m] + ',' + (0.1 * (e + 0.5)) + ')';
  };

  var table = document.createElement('table');
  var thead = document.createElement('thead');
  table.appendChild(thead);
  
  !function() {
    var tr = document.createElement('tr');
    var th = document.createElement('th');
    th.appendChild(document.createTextNode('Type'));
    th.setAttribute('rowspan', '2');
    tr.appendChild(th);
    for (var m = 0; m < 4; m += 1) {
      var th = document.createElement('th');
      th.setAttribute('colspan', '4');
      th.style.backgroundColor = getCellBg(m, 4);
      th.style.textAlign = 'center';
      th.appendChild(document.createTextNode(modes[m]));
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }();
  
  !function() {
    var tr = document.createElement('tr');
    for (var m = 0; m < 4; m += 1) {
      for (var e = 0; e < 4; e += 1) {
        var th = document.createElement('th');
        th.style.backgroundColor = getCellBg(m, e % 2);
        th.style.textAlign = 'center';
        th.appendChild(document.createTextNode(ecls[e]));
        tr.appendChild(th);
      }
    }
    thead.appendChild(tr);
  }();
  
  var tbody = document.createElement('tbody');
  table.appendChild(tbody);
  for (var t = 0; t < DATA_CAPS.length; t += 1) {
    var tr = document.createElement('tr');
    tr.style.backgroundColor = 'rgba(0,0,0,' + (t % 2 == 0 ? 0 : 0.05) + ')';
    var td = document.createElement('td');
    td.style.textAlign = 'center';
    td.style.fontWeight = '600';
    td.appendChild(document.createTextNode('' + (t + 1)));
    tr.appendChild(td);
    for (var m = 0; m < 4; m += 1) {
      for (var e = 0; e < 4; e += 1) {
        var td = document.createElement('td');
        td.style.backgroundColor = getCellBg(m, e % 2);
        td.style.textAlign = 'right';
        td.appendChild(document.createTextNode('' + DATA_CAPS[t][e][m]));
        tr.appendChild(td);
      }
    }
    tbody.appendChild(tr);
  }
  return table;
};

var DATA_CAPS = [
  /* 1 */ [[41, 25, 17, 10], [34, 20, 14, 8], [27, 16, 11, 7], [17, 10, 7, 4]],
  /* 2 */ [[77, 47, 32, 20], [63, 38, 26, 16], [48, 29, 20, 12], [34, 20, 14, 8]],
  /* 3 */ [[127, 77, 53, 32], [101, 61, 42, 26], [77, 47, 32, 20], [58, 35, 24, 15]],
  /* 4 */ [[187, 114, 78, 48], [149, 90, 62, 38], [111, 67, 46, 28], [82, 50, 34, 21]],
  /* 5 */ [[255, 154, 106, 65], [202, 122, 84, 52], [144, 87, 60, 37], [106, 64, 44, 27]],
  /* 6 */ [[322, 195, 134, 82], [255, 154, 106, 65], [178, 108, 74, 45], [139, 84, 58, 36]],
  /* 7 */ [[370, 224, 154, 95], [293, 178, 122, 75], [207, 125, 86, 53], [154, 93, 64, 39]],
  /* 8 */ [[461, 279, 192, 118], [365, 221, 152, 93], [259, 157, 108, 66], [202, 122, 84, 52]],
  /* 9 */ [[552, 335, 230, 141], [432, 262, 180, 111], [312, 189, 130, 80], [235, 143, 98, 60]],
  /* 10 */ [[652, 395, 271, 167], [513, 311, 213, 131], [364, 221, 151, 93], [288, 174, 119, 74]],
  /* 11 */ [[772, 468, 321, 198], [604, 366, 251, 155], [427, 259, 177, 109], [331, 200, 137, 85]],
  /* 12 */ [[883, 535, 367, 226], [691, 419, 287, 177], [489, 296, 203, 125], [374, 227, 155, 96]],
  /* 13 */ [[1022, 619, 425, 262], [796, 483, 331, 204], [580, 352, 241, 149], [427, 259, 177, 109]],
  /* 14 */ [[1101, 667, 458, 282], [871, 528, 362, 223], [621, 376, 258, 159], [468, 283, 194, 120]],
  /* 15 */ [[1250, 758, 520, 320], [991, 600, 412, 254], [703, 426, 292, 180], [530, 321, 220, 136]],
  /* 16 */ [[1408, 854, 586, 361], [1082, 656, 450, 277], [775, 470, 322, 198], [602, 365, 250, 154]],
  /* 17 */ [[1548, 938, 644, 397], [1212, 734, 504, 310], [876, 531, 364, 224], [674, 408, 280, 173]],
  /* 18 */ [[1725, 1046, 718, 442], [1346, 816, 560, 345], [948, 574, 394, 243], [746, 452, 310, 191]],
  /* 19 */ [[1903, 1153, 792, 488], [1500, 909, 624, 384], [1063, 644, 442, 272], [813, 493, 338, 208]],
  /* 20 */ [[2061, 1249, 858, 528], [1600, 970, 666, 410], [1159, 702, 482, 297], [919, 557, 382, 235]],
  /* 21 */ [[2232, 1352, 929, 572], [1708, 1035, 711, 438], [1224, 742, 509, 314], [969, 587, 403, 248]],
  /* 22 */ [[2409, 1460, 1003, 618], [1872, 1134, 779, 480], [1358, 823, 565, 348], [1056, 640, 439, 270]],
  /* 23 */ [[2620, 1588, 1091, 672], [2059, 1248, 857, 528], [1468, 890, 611, 376], [1108, 672, 461, 284]],
  /* 24 */ [[2812, 1704, 1171, 721], [2188, 1326, 911, 561], [1588, 963, 661, 407], [1228, 744, 511, 315]],
  /* 25 */ [[3057, 1853, 1273, 784], [2395, 1451, 997, 614], [1718, 1041, 715, 440], [1286, 779, 535, 330]],
  /* 26 */ [[3283, 1990, 1367, 842], [2544, 1542, 1059, 652], [1804, 1094, 751, 462], [1425, 864, 593, 365]],
  /* 27 */ [[3517, 2132, 1465, 902], [2701, 1637, 1125, 692], [1933, 1172, 805, 496], [1501, 910, 625, 385]],
  /* 28 */ [[3669, 2223, 1528, 940], [2857, 1732, 1190, 732], [2085, 1263, 868, 534], [1581, 958, 658, 405]],
  /* 29 */ [[3909, 2369, 1628, 1002], [3035, 1839, 1264, 778], [2181, 1322, 908, 559], [1677, 1016, 698, 430]],
  /* 30 */ [[4158, 2520, 1732, 1066], [3289, 1994, 1370, 843], [2358, 1429, 982, 604], [1782, 1080, 742, 457]],
  /* 31 */ [[4417, 2677, 1840, 1132], [3486, 2113, 1452, 894], [2473, 1499, 1030, 634], [1897, 1150, 790, 486]],
  /* 32 */ [[4686, 2840, 1952, 1201], [3693, 2238, 1538, 947], [2670, 1618, 1112, 684], [2022, 1226, 842, 518]],
  /* 33 */ [[4965, 3009, 2068, 1273], [3909, 2369, 1628, 1002], [2805, 1700, 1168, 719], [2157, 1307, 898, 553]],
  /* 34 */ [[5253, 3183, 2188, 1347], [4134, 2506, 1722, 1060], [2949, 1787, 1228, 756], [2301, 1394, 958, 590]],
  /* 35 */ [[5529, 3351, 2303, 1417], [4343, 2632, 1809, 1113], [3081, 1867, 1283, 790], [2361, 1431, 983, 605]],
  /* 36 */ [[5836, 3537, 2431, 1496], [4588, 2780, 1911, 1176], [3244, 1966, 1351, 832], [2524, 1530, 1051, 647]],
  /* 37 */ [[6153, 3729, 2563, 1577], [4775, 2894, 1989, 1224], [3417, 2071, 1423, 876], [2625, 1591, 1093, 673]],
  /* 38 */ [[6479, 3927, 2699, 1661], [5039, 3054, 2099, 1292], [3599, 2181, 1499, 923], [2735, 1658, 1139, 701]],
  /* 39 */ [[6743, 4087, 2809, 1729], [5313, 3220, 2213, 1362], [3791, 2298, 1579, 972], [2927, 1774, 1219, 750]],
  /* 40 */ [[7089, 4296, 2953, 1817], [5596, 3391, 2331, 1435], [3993, 2420, 1663, 1024], [3057, 1852, 1273, 784]]
];