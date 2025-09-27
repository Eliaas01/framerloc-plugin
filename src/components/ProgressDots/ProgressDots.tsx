import { useEffect, useState } from 'react'
import './ProgressDots.css'

interface ProgressDotsProps {
    currentPanel: number;
    totalPanels?: number;
    onDotClick: (index: number) => void;
}

export function ProgressDots({ currentPanel, totalPanels = 3, onDotClick }: ProgressDotsProps) {
    const [delayedPanel, setDelayedPanel] = useState(currentPanel)

    useEffect(() => {
        const timer = setTimeout(() => {
            setDelayedPanel(currentPanel)
        }, 500)
        return () => clearTimeout(timer)
    }, [currentPanel])

    return (
        <div className="progress-indicators">
            <div
                className={`progress-indicator ${delayedPanel >= 0 ? 'active' : ''}`}
                onClick={() => onDotClick(0)}
            >
                {delayedPanel >= 1 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#4294f7" viewBox="0 0 256 256">
                        <path d="M208,76H100V56a28,28,0,0,1,28-28c13.51,0,25.65,9.62,28.24,22.39a12,12,0,1,0,23.52-4.78C174.87,21.5,153.1,4,128,4A52.06,52.06,0,0,0,76,56V76H48A20,20,0,0,0,28,96V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V96A20,20,0,0,0,208,76Zm-4,128H52V100H204Zm-88-30.34V180a12,12,0,0,0,24,0v-6.34a32,32,0,1,0-24,0ZM128,136a8,8,0,1,1-8,8A8,8,0,0,1,128,136Z"/>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill={delayedPanel >= 0 ? "#4294f7" : "#2d2d2d"} viewBox="0 0 256 256">
                        <path d="M208,76H180V56A52,52,0,0,0,76,56V76H48A20,20,0,0,0,28,96V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V96A20,20,0,0,0,208,76ZM100,56a28,28,0,0,1,56,0V76H100ZM204,204H52V100H204Zm-76-92a32,32,0,0,0-12,61.66V180a12,12,0,0,0,24,0v-6.34A32,32,0,0,0,128,112Zm0,24a8,8,0,1,1-8,8A8,8,0,0,1,128,136Z"/>
                    </svg>
                )}
            </div>
            <div className={`progress-line ${delayedPanel >= 1 ? 'active' : ''}`} />
            <div
                className={`progress-indicator ${delayedPanel >= 1 ? 'active' : ''}`}
                onClick={() => onDotClick(1)}
            >
                {delayedPanel >= 2 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#4294f7" viewBox="0 0 256 256">
                        <path d="M87.5,151.52l64-64a12,12,0,0,1,17,17l-64,64a12,12,0,0,1-17-17Zm131-114a60.08,60.08,0,0,0-84.87,0L103.51,67.61a12,12,0,0,0,17,17l30.07-30.06a36,36,0,0,1,50.93,50.92L171.4,135.52a12,12,0,1,0,17,17l30.08-30.06A60.09,60.09,0,0,0,218.45,37.55ZM135.52,171.4l-30.07,30.08a36,36,0,0,1-50.92-50.93l30.06-30.07a12,12,0,0,0-17-17L37.55,133.58a60,60,0,0,0,84.88,84.87l30.06-30.07a12,12,0,0,0-17-17Z"/>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill={delayedPanel >= 1 ? "#4294f7" : "#2d2d2d"} viewBox="0 0 256 256">
                        <path d="M117.18,188.74a12,12,0,0,1,0,17l-5.12,5.12A58.26,58.26,0,0,1,70.6,228h0A58.62,58.62,0,0,1,29.14,127.92L63.89,93.17a58.64,58.64,0,0,1,98.56,28.11,12,12,0,1,1-23.37,5.44,34.65,34.65,0,0,0-58.22-16.58L46.11,144.89A34.62,34.62,0,0,0,70.57,204h0a34.41,34.41,0,0,0,24.49-10.14l5.11-5.12A12,12,0,0,1,117.18,188.74ZM226.83,45.17a58.65,58.65,0,0,0-82.93,0l-5.11,5.11a12,12,0,0,0,17,17l5.12-5.12a34.63,34.63,0,1,1,49,49L175.1,145.86A34.39,34.39,0,0,1,150.61,156h0a34.63,34.63,0,0,1-33.69-26.72,12,12,0,0,0-23.38,5.44A58.64,58.64,0,0,0,150.56,180h.05a58.28,58.28,0,0,0,41.47-17.17l34.75-34.75a58.62,58.62,0,0,0,0-82.91Z"/>
                    </svg>
                )}
            </div>
            <div className={`progress-line ${delayedPanel >= 2 ? 'active' : ''}`} />
            <div
                className={`progress-indicator ${delayedPanel >= 2 ? 'active' : ''}`}
                onClick={() => onDotClick(2)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill={delayedPanel >= 2 ? "#4294f7" : "#2d2d2d"} viewBox="0 0 256 256">
                    <path d="M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm-34.32,69.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"/>
                </svg>
            </div>
        </div>
    )
}
