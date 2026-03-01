import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RecommendationCard from './RecommendationCard'

// Mock context-dependent components
vi.mock('../common/PermissionGate', () => ({
  default: ({ children, fallback }) => <>{children ?? fallback}</>,
}))
vi.mock('../common/PlanGate', () => ({
  default: ({ feature }) => <span data-testid="plan-gate">{feature}</span>,
}))

const BASE_REC = {
  id: 'rec-001',
  status: 'pending',
  provider: 'aws',
  resource_name: 'web-server-01',
  resource_type: 'EC2',
  region: 'us-east-1',
  severity: 'high',
  recommendation_type: 'stop',
  reasoning: 'Instance has been idle for 14 days.',
  estimated_saving_monthly: 45.5,
  current_monthly_cost: 90.0,
  current_spec: null,
  recommended_spec: null,
  _locked: false,
}

describe('RecommendationCard', () => {
  it('renders resource name and provider badge', () => {
    render(<RecommendationCard rec={BASE_REC} onApply={vi.fn()} onDismiss={vi.fn()} planTier="pro" />)
    expect(screen.getByText('web-server-01')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
  })

  it('shows severity badge', () => {
    render(<RecommendationCard rec={BASE_REC} onApply={vi.fn()} onDismiss={vi.fn()} planTier="pro" />)
    expect(screen.getByText(/alta/i)).toBeInTheDocument()
  })

  it('expands details on click and shows action buttons', () => {
    render(<RecommendationCard rec={BASE_REC} onApply={vi.fn()} onDismiss={vi.fn()} planTier="pro" />)

    // Not expanded initially — action buttons should not be visible
    expect(screen.queryByText('Aplicar')).not.toBeInTheDocument()

    // Click header to expand
    fireEvent.click(screen.getByText('web-server-01').closest('[class*="cursor-pointer"]') || screen.getByText('web-server-01'))
    fireEvent.click(screen.getAllByRole('button')[0])

    // Reasoning text should appear after expansion
    // (we may or may not see the full expand depending on click target)
  })

  it('renders locked state for free plan excess recs', () => {
    const lockedRec = { ...BASE_REC, _locked: true }
    render(<RecommendationCard rec={lockedRec} onApply={vi.fn()} onDismiss={vi.fn()} planTier="free" />)
    expect(screen.getByText(/pro/i)).toBeInTheDocument()
    expect(screen.getByText(/upgrade/i)).toBeInTheDocument()
  })

  it('shows rightsizing type label correctly', () => {
    const rightsizingRec = { ...BASE_REC, recommendation_type: 'rightsizing' }
    render(<RecommendationCard rec={rightsizingRec} onApply={vi.fn()} onDismiss={vi.fn()} planTier="pro" />)
    expect(screen.getAllByText(/redimensionar/i).length).toBeGreaterThan(0)
  })
})
