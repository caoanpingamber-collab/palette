import { useEffect, useRef, useState } from 'react'
import './PatternRefraction.css'

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  attribute vec2 aUv;
  varying vec2 vUv;

  void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uStrength;
  uniform float uAngle;
  uniform float uSmoothness;
  uniform float uDispersion;
  uniform float uRadius;
  uniform float uOverscan;
  uniform float uStrengthMin;
  uniform float uStrengthRange;

  const float PI = 3.141592653589793;

  vec4 sampleZero(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      return vec4(0.0);
    }
    return texture2D(uTexture, uv);
  }

  void main() {
    vec2 sourceUv = vUv * (1.0 + uOverscan * 2.0) - uOverscan;
    vec2 p = sourceUv - 0.5;
    vec2 axis = vec2(cos(uAngle), sin(uAngle));
    vec2 normal = vec2(-axis.y, axis.x);

    float crossCoord = dot(p, normal);
    float alongCoord = dot(p, axis);
    float strengthNorm = clamp((uStrength - uStrengthMin) / max(uStrengthRange, 0.001), 0.0, 1.0);
    float baseFrequency = mix(7.9, 10.9, clamp(uRadius * 25.0, 0.0, 1.0));
    float frequency = baseFrequency + strengthNorm * 5.2;
    float phaseSkew = mix(0.035, 0.082, strengthNorm);
    float phase = (crossCoord + alongCoord * phaseSkew) * frequency * PI * 2.0 + strengthNorm * PI * 0.9;
    float wave = sin(phase);
    float wavePower = mix(1.34, 0.68, strengthNorm) * mix(1.16, 0.9, uSmoothness);
    float softWave = sign(wave) * pow(abs(wave), wavePower);
    float strength = clamp(uStrength / 100.0, 0.0, 0.6);
    float amplitude = mix(0.006, 0.176, strengthNorm);

    vec2 offset = normal * softWave * amplitude;
    offset += axis * cos(phase) * amplitude * mix(0.05, 0.16, strengthNorm);

    float chroma = uDispersion * 0.026;
    vec2 chromaOffset = normal * chroma * softWave;
    vec2 refractedUv = sourceUv + offset;
    vec4 redSample = sampleZero(refractedUv + chromaOffset);
    vec4 greenSample = sampleZero(refractedUv);
    vec4 blueSample = sampleZero(refractedUv - chromaOffset);

    float refractedAlpha = max(max(redSample.a, greenSample.a), blueSample.a);
    float alpha = refractedAlpha * 0.88;
    vec3 color = vec3(redSample.r, greenSample.g, blueSample.b);

    float alphaEdge =
      abs(sampleZero(refractedUv + normal * 0.007).a - sampleZero(refractedUv - normal * 0.007).a) +
      abs(sampleZero(refractedUv + axis * 0.006).a - sampleZero(refractedUv - axis * 0.006).a);

    float slope = cos(phase);
    float innerBand = sin(phase * mix(1.18, 1.58, strengthNorm) + alongCoord * PI * mix(1.0, 3.1, strengthNorm));
    vec2 surfaceBend =
      normal * (slope * mix(0.42, 0.86, strengthNorm) + innerBand * mix(0.08, 0.22, strengthNorm)) +
      axis * sin(phase * 0.5) * mix(0.08, 0.2, strengthNorm);
    vec3 surfaceNormal = normalize(vec3(surfaceBend, 1.0));
    vec3 lightDirection = normalize(vec3(-0.48, -0.62, 0.92));
    float lighting = clamp(dot(surfaceNormal, lightDirection), 0.0, 1.0);
    float highlight = smoothstep(0.62, 0.96, lighting) * alpha;
    float shadow = smoothstep(0.48, 0.08, lighting) * alpha;
    float ridgeHighlight = smoothstep(0.76, 1.0, abs(slope)) * alpha;
    float bandHighlight = smoothstep(0.28, 0.92, innerBand) * alpha * strengthNorm;
    float bandShade = smoothstep(0.18, 0.86, -innerBand) * alpha * strengthNorm;
    float edgeShadow = smoothstep(0.16, 0.56, alphaEdge) * alpha;
    vec2 lightDelta = sourceUv - vec2(0.39, 0.62);
    lightDelta = vec2(lightDelta.x * 0.92, lightDelta.y * 1.35);
    float lightPool = smoothstep(0.48, 0.0, length(lightDelta));
    float localSpec = 0.08 + lightPool * 1.08;
    float outsideLight = 1.0 - lightPool;

    color = mix(vec3(0.955, 0.982, 1.0), color, 0.72);
    color += vec3(1.0) * (highlight * 0.18 + ridgeHighlight * 0.08 + bandHighlight * 0.1) * localSpec;
    color -= vec3(0.12, 0.15, 0.17) * (shadow * (0.085 + outsideLight * 0.045) + edgeShadow * 0.07 + bandShade * 0.055);

    vec3 cyanEdge = vec3(0.0, 0.82, 1.0) * max(softWave, 0.0);
    vec3 goldEdge = vec3(1.0, 0.78, 0.05) * max(-softWave, 0.0);
    float prism = (0.2 + smoothstep(0.12, 0.58, alphaEdge) * 0.8) * (0.3 + abs(softWave) * 0.48 + abs(innerBand) * 0.22) * alpha;
    color += (cyanEdge + goldEdge) * prism * uDispersion * 1.38;

    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(message || 'Shader compilation failed')
  }
  return shader
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(message || 'Program link failed')
  }
  return program
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Cannot load pattern refraction source: ${src}`))
    image.src = src
  })
}

function animatedStrength(now, min, max, duration) {
  const progress = (now % duration) / duration
  const linearProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2
  return min + (max - min) * linearProgress
}

export default function PatternRefraction({
  src,
  className = '',
  strengthMin = 17,
  strengthMax = 34,
  duration = 6000,
  angle = 49.58624267578125,
  smoothness = 0.75,
  dispersion = 0.08,
  radius = 0.02587597131729126,
  overscan = 0.18,
}) {
  const canvasRef = useRef(null)
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let frameId = 0
    let disposed = false
    let lastFrame = 0
    let resizeObserver = null

    const drawStaticFallback = () => {
      readyRef.current = false
      setReady(false)
    }

    const setup = async () => {
      try {
        const image = await loadImage(src)
        if (disposed) return

        const gl = canvas.getContext('webgl', {
          alpha: true,
          premultipliedAlpha: true,
          antialias: true,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
        })
        if (!gl) {
          drawStaticFallback()
          return
        }

        const program = createProgram(gl)
        gl.useProgram(program)

        const vertices = new Float32Array([
          -1, -1, 0, 0,
          1, -1, 1, 0,
          -1, 1, 0, 1,
          1, 1, 1, 1,
        ])
        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

        const stride = 4 * Float32Array.BYTES_PER_ELEMENT
        const positionLocation = gl.getAttribLocation(program, 'aPosition')
        const uvLocation = gl.getAttribLocation(program, 'aUv')
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0)
        gl.enableVertexAttribArray(uvLocation)
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT)

        const texture = gl.createTexture()
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)

        const uniforms = {
          texture: gl.getUniformLocation(program, 'uTexture'),
          strength: gl.getUniformLocation(program, 'uStrength'),
          angle: gl.getUniformLocation(program, 'uAngle'),
          smoothness: gl.getUniformLocation(program, 'uSmoothness'),
          dispersion: gl.getUniformLocation(program, 'uDispersion'),
          radius: gl.getUniformLocation(program, 'uRadius'),
          overscan: gl.getUniformLocation(program, 'uOverscan'),
          strengthMin: gl.getUniformLocation(program, 'uStrengthMin'),
          strengthRange: gl.getUniformLocation(program, 'uStrengthRange'),
        }

        gl.uniform1i(uniforms.texture, 0)
        gl.uniform1f(uniforms.angle, (angle * Math.PI) / 180)
        gl.uniform1f(uniforms.smoothness, smoothness)
        gl.uniform1f(uniforms.dispersion, dispersion)
        gl.uniform1f(uniforms.radius, radius)
        gl.uniform1f(uniforms.overscan, overscan)
        gl.uniform1f(uniforms.strengthMin, strengthMin)
        gl.uniform1f(uniforms.strengthRange, strengthMax - strengthMin)
        gl.clearColor(0, 0, 0, 0)

        const resize = () => {
          const rect = canvas.getBoundingClientRect()
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
          const width = Math.max(1, Math.round(rect.width * dpr))
          const height = Math.max(1, Math.round(rect.height * dpr))
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
            gl.viewport(0, 0, width, height)
          }
        }

        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(canvas)
        resize()

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const draw = (now = 0) => {
          if (disposed) return
          if (!prefersReducedMotion && now - lastFrame < 33) {
            frameId = window.requestAnimationFrame(draw)
            return
          }
          lastFrame = now
          resize()
          gl.clear(gl.COLOR_BUFFER_BIT)
          gl.uniform1f(
            uniforms.strength,
            prefersReducedMotion ? strengthMin : animatedStrength(now, strengthMin, strengthMax, duration),
          )
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
          if (!readyRef.current) {
            readyRef.current = true
            setReady(true)
          }
          frameId = window.requestAnimationFrame(draw)
        }

        draw()
      } catch {
        drawStaticFallback()
      }
    }

    setup()

    return () => {
      disposed = true
      if (frameId) window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
    }
  }, [angle, dispersion, duration, overscan, radius, smoothness, src, strengthMax, strengthMin])

  return (
    <span
      className={`pattern-refraction ${className}`}
      data-ready={ready ? 'true' : 'false'}
      style={{
        '--pattern-overscan': `${overscan * 100}%`,
        '--pattern-size': `${100 + overscan * 200}%`,
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="pattern-refraction__canvas" />
      <img src={src} alt="" className="pattern-refraction__fallback" draggable="false" />
    </span>
  )
}
