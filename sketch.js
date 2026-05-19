let peer;
let myId;
let video; 
let handPose;
let hands = [];
let isPhone = false;
let remoteStreamReady = false;
let connectionStatus = "初始化中...";
let qrcodeGenerated = false;
let peerError = null;

// 猜拳遊戲狀態
let gameState = 'WAITING'; // 'WAITING' (等待出拳) 或 'RESULT' (顯示結果)
let userChoice = 0;        // 1: 剪刀(2指), 2: 石頭(0指), 3: 布(5指)
let aiChoice = 0;
let gameResult = "";
let btnPlayAgain, btnExit;

function setup() {
  createCanvas(windowWidth, windowHeight);

  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get('room');

  const peerConfig = {
    config: {
      'iceServers': [
        { url: 'stun:stun.l.google.com:19302' },
        { url: 'stun:stun1.l.google.com:19302' }
      ]
    }
  };

  if (room) {
    // === 手機端模式 ===
    isPhone = true;
    connectionStatus = "請求相機權限...";
    // 使用 flipped: true 確保與你提供的範例一致
    video = createCapture({ video: { facingMode: "user" }, audio: false }, (stream) => {
      // 強制手機瀏覽器播放
      video.elt.setAttribute('playsinline', '');
      video.elt.muted = true;
      video.elt.play();
      
      peer = new Peer(peerConfig);
      peer.on('open', (id) => {
        myId = id;
        peer.call(room, stream);
        connectionStatus = "影像傳送中...";
      });
    });
    video.size(640, 480);
    video.hide();
  } else {
    // === 電腦端模式 ===
    peer = new Peer(peerConfig);
    peer.on('open', (id) => {
      myId = id;
      connectionStatus = "等待手機連線...";
      if (typeof updateQRCode === 'function' && !qrcodeGenerated) {
        updateQRCode(id);
        qrcodeGenerated = true;
      }
    });

    peer.on('call', (call) => {
      connectionStatus = "手機已連線";
      call.answer();
      call.on('stream', (stream) => {
        if (video) video.remove();
        video = createVideo([]);
        video.elt.muted = true;
        video.elt.setAttribute('playsinline', 'true');
        video.elt.srcObject = stream;
        video.hide();

        video.elt.onloadedmetadata = () => {
          video.elt.play();
          remoteStreamReady = true;
          // 初始化 ml5 handPose
          handPose = ml5.handPose(() => {
            console.log("HandPose 模型已準備好");
            handPose.detectStart(video, results => { hands = results; });
          });
        };
      });
    });

    // 建立遊戲按鈕
    btnPlayAgain = createButton('再玩一局');
    styleButton(btnPlayAgain, '#4CAF50');
    btnPlayAgain.mousePressed(resetGame);
    btnPlayAgain.hide();

    btnExit = createButton('離開');
    styleButton(btnExit, '#f44336');
    btnExit.mousePressed(() => location.reload());
    btnExit.hide();
  }
}

function styleButton(btn, bgColor) {
  btn.style('padding', '15px 30px');
  btn.style('font-size', '20px');
  btn.style('color', 'white');
  btn.style('background-color', bgColor);
  btn.style('border', 'none');
  btn.style('border-radius', '10px');
  btn.style('cursor', 'pointer');
}

function resetGame() {
  gameState = 'WAITING';
  userChoice = 0;
  aiChoice = 0;
  gameResult = "";
  btnPlayAgain.hide();
  btnExit.hide();
}

function draw() {
  background(20);
  
  if (isPhone) {
    // 手機端預覽
    if (video && video.elt.readyState >= 2) { 
      image(video, 0, 0, width, height, 0, 0, video.width, video.height, COVER);
    }
    fill(255);
    textAlign(CENTER);
    text(connectionStatus, width / 2, height - 50);
  } else {
    // 電腦端：猜拳對戰佈局
    let boxW = 480;
    let boxH = 360;
    let gap = 60;
    let userX = (width - (boxW * 2 + gap)) / 2;
    let aiX = userX + boxW + gap;
    let centerY = (height - boxH) / 2;

    // 繪製對戰標籤
    fill(255);
    textSize(28);
    textAlign(CENTER);
    text("你 (玩家)", userX + boxW/2, centerY - 20);
    text("AI 對手", aiX + boxW/2, centerY - 20);

    // 繪製背景邊框
    stroke(255, 50);
    noFill();
    rect(userX, centerY, boxW, boxH);
    rect(aiX, centerY, boxW, boxH);

    if (remoteStreamReady && video && video.elt.readyState >= 2) {
      // 將手機串流影像繪製到左邊玩家框
      drawingContext.drawImage(video.elt, userX, centerY, boxW, boxH);
      
      let detectedFingers = -1;
      if (hands && hands.length > 0) {
        const hand = hands[0];
        // 繪製手指骨架點
        for (let kp of hand.keypoints) {
          fill(0, 255, 150);
          noStroke();
          let px = map(kp.x, 0, 640, userX, userX + boxW);
          let py = map(kp.y, 0, 480, centerY, centerY + boxH);
          circle(px, py, 8);
        }
        detectedFingers = getFingerCount(hand);
      }

      if (gameState === 'WAITING') {
        let choice = fingersToChoice(detectedFingers);
        if (choice !== 0) {
          userChoice = choice;
          aiChoice = floor(random(1, 4));
          gameResult = determineWinner(userChoice, aiChoice);
          gameState = 'RESULT';
          
          btnPlayAgain.show();
          btnExit.show();
          btnPlayAgain.position(width/2 - 140, centerY + boxH + 50);
          btnExit.position(width/2 + 20, centerY + boxH + 50);
        }
        fill(255, 255, 0);
        textSize(32);
        text("比出你的拳...", userX + boxW/2, centerY + boxH/2);
      } else {
        const icons = ["", "✌️ 剪刀", "✊ 石頭", "🖐️ 布"];
        textSize(60);
        fill(255);
        text(icons[userChoice], userX + boxW/2, centerY + boxH/2);
        fill(255, 100, 100);
        text(icons[aiChoice], aiX + boxW/2, centerY + boxH/2);

        fill(255, 255, 0);
        textSize(100);
        text(gameResult, width/2, centerY + boxH/2);
      }
    } else {
      fill(255);
      textSize(24);
      text(connectionStatus, width / 2, height / 2);
    }
  }

  // 作者資訊
  fill(150);
  textSize(16);
  textAlign(CENTER);
  text('414730050 曹苡萱', width / 2, height - 30);
}

function getFingerCount(hand) {
  let k = hand.keypoints;
  let count = 0;
  // 檢查食指、中指、無名指、小指
  if (k[8].y < k[6].y) count++;   
  if (k[12].y < k[10].y) count++;  
  if (k[16].y < k[14].y) count++; 
  if (k[20].y < k[18].y) count++; 

  // 檢查大拇指
  let d1 = dist(k[4].x, k[4].y, k[17].x, k[17].y);
  let d2 = dist(k[2].x, k[2].y, k[17].x, k[17].y);
  if (d1 > d2) count++;

  return count;
}

function fingersToChoice(count) {
  if (count === 0) return 2; // 石頭
  if (count === 2) return 1; // 剪刀
  if (count === 5) return 3; // 布
  return 0;
}

function determineWinner(u, ai) {
  if (u === ai) return "平手";
  if ((u === 1 && ai === 3) || (u === 2 && ai === 1) || (u === 3 && ai === 2)) {
    return "你贏了！";
  }
  return "你輸了";
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
