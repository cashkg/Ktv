<!-- 放在 host.html 裡 -->
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
<script>
function renderQRCode(text){
  const canvas = document.getElementById("qrcodeCanvas");
  if(!canvas) return;
  QRCode.toCanvas(canvas, text, {
    width: 256,                 // 固定尺寸
    margin: 2,                  // 邊框
    color: { dark:"#000", light:"#fff" },
    errorCorrectionLevel: "H"   // 高容錯
  }, function (error) {
    if (error) console.error(error);
    else console.log("QRCode 生成成功");
  });
}
</script>
