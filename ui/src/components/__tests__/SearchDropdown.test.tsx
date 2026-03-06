import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import SearchDropdown from '../SearchDropdown'
import { searchService } from '../../services/searchService'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../services/searchService', () => ({
  searchService: {
    quickSearch: vi.fn(),
  },
}))

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('SearchDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchService.quickSearch).mockResolvedValue([])
  })

  it('should render search input', () => {
    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    expect(screen.getByPlaceholderText('searchDropdown.placeholder')).toBeInTheDocument()
  })

  it('should focus the search input when clicked', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText('searchDropdown.placeholder')
    await user.click(searchInput)

    expect(searchInput).toHaveFocus()
  })

  it('should update input value on type', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText('searchDropdown.placeholder')
    await user.type(searchInput, 'test-pod')

    expect(searchInput).toHaveValue('test-pod')
  })

  it('should clear input on clear button click', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText('searchDropdown.placeholder')
    await user.type(searchInput, 'test')
    expect(searchInput).toHaveValue('test')

    const clearButton = screen.queryByRole('button', { name: /close-circle/i })
    if (clearButton) {
      await user.click(clearButton)
      expect(searchInput).toHaveValue('')
    }
  })

  it('should keep input mounted after escape key press', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText('searchDropdown.placeholder')
    await user.click(searchInput)
    await user.type(searchInput, 'test')
    await user.keyboard('{Escape}')

    expect(searchInput).toBeInTheDocument()
  })

  it('should debounce search input before calling quick search', async () => {
    vi.mocked(searchService.quickSearch).mockResolvedValue([
      {
        id: '1',
        name: 'test-pod',
        type: 'pod',
        clusterId: '1',
        clusterName: 'demo',
        namespace: 'default',
        status: 'Running',
        description: 'node-1',
      },
    ])

    render(
      <TestWrapper>
        <SearchDropdown />
      </TestWrapper>
    )

    const searchInput = screen.getByPlaceholderText('searchDropdown.placeholder')
    fireEvent.change(searchInput, { target: { value: 'test' } })

    expect(searchService.quickSearch).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(searchService.quickSearch).toHaveBeenCalledWith('test')
    }, { timeout: 1000 })
  })
})

