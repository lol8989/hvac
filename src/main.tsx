import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import SelectionReviewWindow from './components/selection/SelectionReviewWindow'
import './styles.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

// ?view=selection → 장비선정표 '새 창' 페이지(도면을 가리지 않는 별도 창), 그 외 → 생성 작업 앱.
const isSelectionWindow = new URLSearchParams(window.location.search).get('view') === 'selection'

createRoot(rootEl).render(
  <React.StrictMode>
    {isSelectionWindow ? <SelectionReviewWindow /> : <App />}
  </React.StrictMode>,
)
