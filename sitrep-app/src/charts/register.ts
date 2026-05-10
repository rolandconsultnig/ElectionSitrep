import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
} from 'chart.js'

const NAVY = '#0A1628'

ChartJS.defaults.font.family = "'DM Sans', system-ui, sans-serif"
ChartJS.defaults.color = '#8A9AB8'
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.07)'

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

export const chartColors = {
  nav: NAVY,
  green: '#00C896',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  muted: '#8A9AB8',
  border: 'rgba(255,255,255,0.07)',
}

export function chartTooltipTheme() {
  return {
    backgroundColor: NAVY,
    titleColor: chartColors.muted,
    bodyColor: '#E8EDF5',
    borderColor: chartColors.border,
    borderWidth: 1,
  }
}
