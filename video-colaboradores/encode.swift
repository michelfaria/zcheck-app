// Codifica uma pasta de JPEGs em MP4 (H.264) usando AVFoundation.
// Existe porque não há ffmpeg com libx264 nesta máquina — o ffmpeg que vem
// com o Playwright só codifica VP8/webm.
// Uso: encode <pastaDeFrames> <saida.mp4> <fps> <largura> <altura> [bitrate_bps]

import Foundation
import AVFoundation
import ImageIO
import CoreGraphics

let a = CommandLine.arguments
guard a.count >= 6 else { fputs("uso: encode <frames> <out.mp4> <fps> <w> <h> [bitrate]\n", stderr); exit(1) }
let framesDir = a[1], outPath = a[2]
let fps = Int32(a[3])!, W = Int(a[4])!, H = Int(a[5])!
let bitrate = a.count >= 7 ? Int(a[6])! : 4_500_000

let files = try FileManager.default.contentsOfDirectory(atPath: framesDir)
    .filter { $0.hasSuffix(".jpg") }.sorted()
guard !files.isEmpty else { fputs("sem frames\n", stderr); exit(1) }

let outURL = URL(fileURLWithPath: outPath)
try? FileManager.default.removeItem(at: outURL)

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: W,
    AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoMaxKeyFrameIntervalKey: fps * 2,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoAllowFrameReorderingKey: true,
    ],
])
input.expectsMediaDataInRealTime = false

let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferWidthKey as String: W,
        kCVPixelBufferHeightKey as String: H,
    ])

writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let space = CGColorSpaceCreateDeviceRGB()

for (i, name) in files.enumerated() {
    let url = URL(fileURLWithPath: framesDir).appendingPathComponent(name)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        fputs("falhou ao ler \(name)\n", stderr); exit(1)
    }

    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buf = pb else { fputs("sem pixel buffer\n", stderr); exit(1) }

    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(
        data: CVPixelBufferGetBaseAddress(buf), width: W, height: H,
        bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
        space: space,
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
    CVPixelBufferUnlockBaseAddress(buf, [])

    while !input.isReadyForMoreMediaData { usleep(2000) }
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
    if i % 150 == 0 { print("  \(i)/\(files.count)") }
}

input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()

if writer.status != .completed {
    fputs("erro: \(writer.error?.localizedDescription ?? "desconhecido")\n", stderr); exit(1)
}
print("ok: \(outPath) — \(files.count) frames")
