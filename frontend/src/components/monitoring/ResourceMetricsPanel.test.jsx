import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResourceMetricsPanel from './ResourceMetricsPanel'

// SkeletonTable uses no context — no mocking needed
vi.mock('../common/SkeletonTable', () => ({
  default: () => <div data-testid="skeleton-table" />,
}))

const SAMPLE_RESOURCES = [
  { id: 'i-001', name: 'web-server-01', type: 'ec2', region: 'us-east-1', cpu_pct: 25.4, net_in_bytes: 1024000, net_out_bytes: 512000 },
  { id: 'i-002', name: 'db-primary', type: 'ec2', region: 'us-west-2', cpu_pct: 82.1, net_in_bytes: null, net_out_bytes: null },
  { id: 'i-003', name: 'api-node', type: 'vm', region: 'eastus', cpu_pct: null, net_in_bytes: null, net_out_bytes: null },
]

describe('ResourceMetricsPanel', () => {
  it('shows skeleton while loading', () => {
    render(<ResourceMetricsPanel resources={[]} isLoading={true} isError={false} onRefresh={vi.fn()} />)
    expect(screen.getByTestId('skeleton-table')).toBeInTheDocument()
  })

  it('shows error message on error', () => {
    render(<ResourceMetricsPanel resources={[]} isLoading={false} isError={true} onRefresh={vi.fn()} />)
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument()
  })

  it('shows empty state when no resources', () => {
    render(<ResourceMetricsPanel resources={[]} isLoading={false} isError={false} onRefresh={vi.fn()} />)
    expect(screen.getByText(/nenhuma instância em execução/i)).toBeInTheDocument()
  })

  it('renders resource rows with correct data', () => {
    render(<ResourceMetricsPanel resources={SAMPLE_RESOURCES} isLoading={false} isError={false} onRefresh={vi.fn()} />)

    expect(screen.getByText('web-server-01')).toBeInTheDocument()
    expect(screen.getByText('db-primary')).toBeInTheDocument()
    expect(screen.getByText('api-node')).toBeInTheDocument()

    // CPU percentage shown for first resource
    expect(screen.getByText('25.4%')).toBeInTheDocument()
    // High CPU shown in red for second resource
    expect(screen.getByText('82.1%')).toBeInTheDocument()

    // Type labels
    expect(screen.getAllByText('EC2').length).toBe(2)
    expect(screen.getByText('VM')).toBeInTheDocument()

    // Footer note about memory agent
    expect(screen.getByText(/memória requer agente/i)).toBeInTheDocument()
  })
})
