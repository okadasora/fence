document.addEventListener("DOMContentLoaded", function () {
    const video = document.getElementById("videoPlayer");
    const fileInput = document.getElementById("videoFile");
    const logTable = document.querySelector("#logTable tbody");
    const downloadBtn = document.getElementById("downloadBtn");
    const tagSearch = document.getElementById("tagSearch");
    const timelineBar = document.getElementById("timelineBar");

    let lastTag = null;
    let lastTimestamp = 0;

    // 新しい動画ファイルがアップロードされた時
    fileInput.addEventListener("change", function (event) {
        document.querySelector("#logTableLeft tbody").innerHTML = ''; // 左選手のログテーブルをクリア
        document.querySelector("#logTableRight tbody").innerHTML = ''; // 右選手のログテーブルをクリア
        timelineBar.innerHTML = ''; // タイムラインバーをクリア
    
        const file = event.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            console.log("Generated URL:", url); // デバッグ用
            video.src = url;
        }
    });

    function resizeBar() {
        const width = video.clientWidth;
        timelineBar.style.width = `${width - 45}px`; // 例えば動画より20px小さく
    }
    window.addEventListener("resize", resizeBar);
    video.addEventListener("loadedmetadata", resizeBar); // 動画読み込み後にも実行
    
    function addMarker(timestamp) {
        const duration = video.duration;
        if (!duration) return;
    
        const timeline = document.getElementById("timelineBar");
        const marker = document.createElement("div");
        
        const markerId = `marker-${timestamp.toFixed(1).replace('.', '_')}`;
        marker.className = "timeline-marker";
        marker.id = markerId;
        marker.title = `${timestamp.toFixed(1)}秒`;
    
        marker.style.position = "absolute";
        marker.style.left = `${(timestamp / duration) * 100}%`;
        marker.style.top = "0";
        marker.style.width = "2px";
        marker.style.height = "100%";
        marker.style.backgroundColor = "red";
        marker.style.pointerEvents = "auto";
    
        marker.addEventListener("click", (e) => {
            e.stopPropagation();
            video.currentTime = timestamp;
        });
    
        timeline.appendChild(marker);
    
        return markerId; // 返して後で削除できるようにする
    }

    function jumpToTime(timestamp) {
        video.currentTime = timestamp;
        video.play();
    }

    async function createClip(startTime) {
        try {
            if (!video.captureStream) {
                alert("このブラウザでは captureStream() がサポートされていません。");
                return;
            }
    
            // 動画がまだ再生されていない場合、再生を開始
            if (video.paused || video.currentTime !== startTime) {
                video.currentTime = startTime;
                video.play();
            }
    
            const stream = video.captureStream();
            const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
            let chunks = [];
        
            mediaRecorder.ondataavailable = function (event) {
                if (event.data.size > 0) chunks.push(event.data);
            };
    
            mediaRecorder.onstop = function () {
                if (chunks.length === 0) {
                    console.warn("録画データが取得できませんでした。");
                    return;
                }
        
                const webmBlob = new Blob(chunks, { type: "video/webm" });
                const url = URL.createObjectURL(webmBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `clip_${startTime.toFixed(1)}s.webm`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
    
            // 動画を2秒前から録画
            mediaRecorder.start();
            video.currentTime = Math.max(0, startTime - 2);
            video.play();
        
            setTimeout(() => {
                mediaRecorder.stop();
                video.pause();
            }, 4000); // 2秒前から2秒後まで録画（計4秒）
        
        } catch (error) {
            console.error("動画の再生エラー:", error);
            alert("動画を再生できませんでした。");
        }
    }

    function convertCsvToFrameBased(csvContent, fps) {
        const lines = csvContent.trim().split("\n");
        const headers = lines[0];
        const frameLines = [headers]; // 1行目はそのまま
    
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(",");
            const player = cells[0];
            const movement = cells[1];
            const tag = cells[2];
            const timeInSeconds = parseFloat(cells[3]);
    
            if (isNaN(timeInSeconds)) continue;
    
            const centerFrame = Math.round(timeInSeconds * fps);
            const startFrame = centerFrame - 3;
            const endFrame = centerFrame + 3　;
    
            for (let f = startFrame; f <= endFrame; f++) {
                if (f < 0) continue; // 負のフレーム番号は無視
                const newLine = [player, movement, tag, f].join(",");
                frameLines.push(newLine);
            }
        }
    
        return frameLines.join("\n");
    }

    function logTag(tag, timestamp) {
        const movement = document.getElementById("movementSelect").value;
        const selectedPlayer = document.querySelector('input[name="playerSelect"]:checked').value;
        const selectedScore = document.querySelector('input[name="scoreSelect"]:checked').value; // 選択された得点
        const logTable = selectedPlayer === "左" ? document.querySelector("#logTableLeft tbody") : document.querySelector("#logTableRight tbody");
    
        if (!tag || (lastTag === tag && Math.abs(timestamp - lastTimestamp) < 1)) return;
        lastTag = tag;
        lastTimestamp = timestamp;
    
        const markerId = addMarker(timestamp);
    
        const row = logTable.insertRow();
        const cells = Array.from({ length: 6 }, () => row.insertCell()); // 6列に変更
    
        cells[0].textContent = selectedPlayer;
        cells[1].textContent = movement;
        cells[2].textContent = tag;
    
        // 時刻セル + 「編集」「切り取り」ボタン
        const timeSpan = document.createElement("span");
        timeSpan.textContent = `${timestamp.toFixed(1)}秒`;
    
        const cutBtn = document.createElement("button");
        cutBtn.textContent = "前後2秒切り取る";
        cutBtn.style.marginLeft = "10px";
        cutBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            createClip(timestamp);
        });
    
        const editBtn = document.createElement("button");
        editBtn.textContent = "編集";
        editBtn.style.marginLeft = "10px";
        editBtn.addEventListener("click", function (event) {
            event.stopPropagation();
            const newTime = prompt("新しいタイムスタンプを秒単位で入力:", timestamp.toFixed(1));
            if (newTime !== null && !isNaN(parseFloat(newTime))) {
                const updatedTime = parseFloat(newTime);
                timeSpan.textContent = `${updatedTime.toFixed(1)}秒`;
                timestamp = updatedTime;
    
                row.onclick = () => {
                    jumpToTime(updatedTime);
                    createClip(updatedTime);
                };
            }
        });
    
        cells[3].appendChild(timeSpan);
        cells[3].appendChild(cutBtn);
        cells[3].appendChild(editBtn);
    
        // 得点セル
        cells[4].textContent = selectedScore; // 選択された得点を反映
    
        // 削除ボタン
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "削除";
        deleteBtn.style.color = "red";
        deleteBtn.addEventListener("click", function (event) {
            event.stopPropagation();
            const marker = document.getElementById(markerId);
            if (marker) marker.remove();
            logTable.removeChild(row);
            lastTag = null;
        });
        cells[5].appendChild(deleteBtn);
    
        row.dataset.markerId = markerId;
        row.addEventListener("click", function () {
            jumpToTime(timestamp);
            createClip(timestamp);
        });
    }

    document.querySelectorAll(".tag-btn").forEach(button => {
        button.addEventListener("click", () => {
            logTag(button.textContent, video.currentTime);
        });
    });

    downloadBtn.addEventListener("click", async function () {
        const zip = new JSZip();
    
        // 動画ファイルをZIPに追加
        const videoFile = fileInput.files[0];
        if (videoFile) {
            const videoData = await videoFile.arrayBuffer();
            zip.file(videoFile.name, videoData);
        }
    
        // ログデータをCSV形式で追加
        let csvContent = "選手,動き,アクション,時刻,得点\n"; // 得点列を追加
        const logTables = [document.querySelector("#logTableLeft tbody"), document.querySelector("#logTableRight tbody")];
    
        logTables.forEach(logTable => {
            logTable.querySelectorAll("tr").forEach(row => {
                if (row.style.display === "none") return;
    
                const cells = row.querySelectorAll("td");
                const player = cells[0]?.textContent?.trim();
                const movement = cells[1]?.textContent?.trim();
                const tag = cells[2]?.textContent?.trim();
                const timeInSeconds = cells[3]?.querySelector("span")?.textContent?.trim().replace("秒", "") || "";
                const score = cells[4]?.textContent?.trim(); // 得点情報を取得
    
                const rowData = [
                    player,
                    movement,
                    tag,
                    timeInSeconds,
                    score // 得点を追加
                ];
    
                csvContent += rowData.join(",") + "\n";
            });
        });
    
        zip.file("fencing_log.csv", csvContent);
    
        // ZIPファイルを生成してダウンロード
        zip.generateAsync({ type: "blob" }).then(function (content) {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = "fencing_data.zip";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    });
});