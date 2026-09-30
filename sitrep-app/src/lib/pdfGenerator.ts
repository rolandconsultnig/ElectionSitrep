import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

export async function generateDashboardPDF(
  elementId: string, 
  title: string, 
  classification: string = 'RESTRICTED'
) {
  const element = document.getElementById(elementId)
  if (!element) return

  // Temporarily store old styles if needed, though html2canvas does well
  const canvas = await html2canvas(element, { 
    scale: 2, 
    useCORS: true, 
    backgroundColor: '#040b08' 
  })
  const imgData = canvas.toDataURL('image/png')
  
  // A4 size: 210mm x 297mm
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()
  
  // -----------------------------------------------------
  // Header (International Standard Format)
  // -----------------------------------------------------
  pdf.setFontSize(10)
  pdf.setTextColor(239, 68, 68) // Red for RESTRICTED
  pdf.setFont('helvetica', 'bold')
  pdf.text(classification.toUpperCase(), pdfWidth / 2, 12, { align: 'center' })
  
  // Document Title & Metadata
  pdf.setFontSize(16)
  pdf.setTextColor(20, 20, 20)
  pdf.text(title.toUpperCase(), pdfWidth / 2, 22, { align: 'center' })
  
  pdf.setFontSize(9)
  pdf.setTextColor(100, 100, 100)
  pdf.setFont('helvetica', 'normal')
  const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })
  pdf.text(`GENERATED: ${timestamp} WAT`, pdfWidth / 2, 28, { align: 'center' })
  
  // Add a horizontal line
  pdf.setDrawColor(200, 200, 200)
  pdf.line(15, 32, pdfWidth - 15, 32)

  // -----------------------------------------------------
  // Body (The Dashboard Snapshot)
  // -----------------------------------------------------
  const margin = 15
  const maxImgWidth = pdfWidth - (margin * 2)
  const imgProps = pdf.getImageProperties(imgData)
  const imgHeight = (imgProps.height * maxImgWidth) / imgProps.width
  
  // If the dashboard is very tall, scale it down to fit on one page
  const maxAllowedHeight = pdfHeight - 60
  let finalWidth = maxImgWidth
  let finalHeight = imgHeight
  
  if (imgHeight > maxAllowedHeight) {
    finalHeight = maxAllowedHeight
    finalWidth = (imgProps.width * finalHeight) / imgProps.height
  }
  
  // Center horizontally if scaled down
  const xOffset = (pdfWidth - finalWidth) / 2
  pdf.addImage(imgData, 'PNG', xOffset, 38, finalWidth, finalHeight)

  // -----------------------------------------------------
  // Footer
  // -----------------------------------------------------
  pdf.line(15, pdfHeight - 20, pdfWidth - 15, pdfHeight - 20)
  
  pdf.setFontSize(8)
  pdf.setTextColor(100, 100, 100)
  pdf.text('Property of the National Police Force - Situation Room', 15, pdfHeight - 15)
  pdf.text('Page 1 of 1', pdfWidth - 15, pdfHeight - 15, { align: 'right' })

  pdf.setFontSize(10)
  pdf.setTextColor(239, 68, 68)
  pdf.setFont('helvetica', 'bold')
  pdf.text(classification.toUpperCase(), pdfWidth / 2, pdfHeight - 8, { align: 'center' })

  // Download
  pdf.save(`${title.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.pdf`)
}
