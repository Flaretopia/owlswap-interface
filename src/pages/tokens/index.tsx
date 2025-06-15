import Container from 'app/components/Container'
import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import Typography from 'app/components/Typography'
import { i18n } from '@lingui/core'
import { t } from '@lingui/macro'
import { ExternalLinkIcon, GlobeIcon, InformationCircleIcon } from '@heroicons/react/solid'
import { db } from '../../config/firebase'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import classNames from 'classnames'
import { useActiveWeb3React } from 'app/services/web3'
import ERC20_ABI from 'app/constants/abis/erc20.json'
import PAIR_ABI from 'app/constants/abis/pair.json'
import axios from 'axios'
import Web3 from 'web3'
import RPC from 'app/config/rpc'
import { ChainId } from '@sushiswap/core-sdk'
import { Contract } from '@ethersproject/contracts'
import { Dialog } from '@headlessui/react'
import { Fragment } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ethers } from 'ethers'
import { useRouter } from 'next/router'

interface TokenData {
  name: string
  symbol: string
  tokenAddress: string
  lpAddress: string
  description: string
  website: string
  logoUrl: string
  launchDate: Date
  lpAllocation: string
  devAllocation: string
  initialLiquidity: string
  chainId: string
  totalSupply: string
  creatorAddress: string
  createdAt: Date
  price?: number | null
  marketCap?: number | null
  holders?: number
}

// Helper function to truncate address
const truncateAddress = (address: string) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Update the formatPrice helper to handle null values
const formatPrice = (price: number | null | undefined) => {
  if (price === null || price === undefined) return '-'
  return price < 0.01
    ? `$${price.toFixed(6)}`
    : `$${price.toFixed(2)}`
}

// Similarly, update formatMarketCap to handle null values
const formatMarketCap = (marketCap: number | null | undefined) => {
  if (marketCap === null || marketCap === undefined) return '-'

  if (marketCap >= 1e9) {
    return `$${(marketCap / 1e9).toFixed(1)}B`
  } else if (marketCap >= 1e6) {
    return `$${(marketCap / 1e6).toFixed(1)}M`
  } else if (marketCap >= 1e3) {
    return `$${(marketCap / 1e3).toFixed(1)}K`
  } else {
    return `$${marketCap.toFixed(0)}`
  }
}

// Add formatChange helper
const formatChange = (change: string | null) => {
  if (!change) return '-'
  const num = parseFloat(change)
  const color = num > 0 ? 'text-green' : num < 0 ? 'text-red' : 'text-secondary'
  return <span className={color}>{num > 0 ? '+' : ''}{num.toFixed(2)}%</span>
}

// Add this function at the top with other helper functions
const fetchSGBPrice = async (): Promise<number> => {
  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=songbird&vs_currencies=usd'
    )
    return response.data.songbird.usd
  } catch (error) {
    console.error('Error fetching SGB price:', error)
    return 0
  }
}

// Update the calculateTokenPrice function
const calculateTokenPrice = async (lpAddress: string, tokenAddress: string, library: any) => {
  try {
    if (!library) return null
    
    // Create a simple provider without ENS support
    const provider = library.getSigner ? library.getSigner().provider : library
    if (!provider) return null
    
    const pair = new Contract(lpAddress, PAIR_ABI, provider)
    const token = new Contract(tokenAddress, ERC20_ABI, provider)

    // Get token decimals
    const tokenDecimals = await token.decimals()

    // Get reserves and token order
    const reserves = await pair.getReserves()
    const token0 = await pair.token0()

    // Determine which reserve is token and which is WSGB
    const [tokenReserve, wsgbReserve] = token0.toLowerCase() === tokenAddress.toLowerCase()
      ? [reserves[0], reserves[1]]
      : [reserves[1], reserves[0]]

    // Adjust for decimals
    const adjustedTokenReserve = tokenReserve / Math.pow(10, tokenDecimals)
    const adjustedWsgbReserve = wsgbReserve / Math.pow(10, 18) // WSGB has 18 decimals

    // Calculate price in WSGB
    const priceInWsgb = adjustedWsgbReserve / adjustedTokenReserve

    // Get SGB price from CoinGecko
    const sgbPriceUSD = await fetchSGBPrice()
    console.log(`Price calculation for ${tokenAddress}:`, {
      tokenReserve: adjustedTokenReserve,
      wsgbReserve: adjustedWsgbReserve,
      priceInWsgb,
      sgbPriceUSD,
      finalPriceUSD: priceInWsgb * sgbPriceUSD
    })

    return priceInWsgb * sgbPriceUSD
  } catch (error) {
    console.error('Error calculating price for token:', tokenAddress, error)
    return null
  }
}

// Update the calculateMarketCap function
const calculateMarketCap = async (tokenAddress: string, price: number | null, library: any) => {
  try {
    if (!price || !library) return null

    // Create a simple provider without ENS support
    const provider = library.getSigner ? library.getSigner().provider : library
    if (!provider) return null
    
    const token = new Contract(tokenAddress, ERC20_ABI, provider)
    const decimals = await token.decimals()
    const totalSupply = await token.totalSupply()

    // Convert totalSupply to a proper number considering decimals
    const adjustedSupply = Number(ethers.utils.formatUnits(totalSupply, decimals))
    const marketCap = adjustedSupply * price

    console.log(`Market cap calculation for ${tokenAddress}:`, {
      rawTotalSupply: totalSupply.toString(),
      decimals,
      adjustedSupply,
      price,
      marketCap
    })

    return marketCap
  } catch (error) {
    console.error('Error calculating market cap for token:', tokenAddress, error)
    return null
  }
}

// Add helper function to format total supply
const formatTotalSupply = (supply: string | undefined) => {
  if (!supply) return '-'
  const num = parseFloat(supply)
  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(2)}B`
  } else if (num >= 1e6) {
    return `${(num / 1e6).toFixed(2)}M`
  } else if (num >= 1e3) {
    return `${(num / 1e3).toFixed(2)}K`
  }
  return num.toLocaleString()
}

// Add this helper function at the top with other helpers
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
    .then(() => {
      // You could add a toast notification here if you want
      console.log('Copied to clipboard')
    })
    .catch((err) => {
      console.error('Failed to copy:', err)
    })
}

interface DescriptionModalProps {
  isOpen: boolean
  onClose: () => void
  token: TokenData | null
}

// Update the DescriptionModal component
const DescriptionModal = ({ isOpen, onClose, token }: DescriptionModalProps) => {
  const [showAddressCopied, setShowAddressCopied] = useState(false);
  const [showUrlCopied, setShowUrlCopied] = useState(false);

  if (!isOpen || !token) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(token.tokenAddress);
    setShowAddressCopied(true);
    setTimeout(() => setShowAddressCopied(false), 2000);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/tokens?token=${token?.tokenAddress}`
    copyToClipboard(shareUrl);
    setShowUrlCopied(true);
    setTimeout(() => setShowUrlCopied(false), 2000);
  };

  // Update the header section JSX
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/70"
        onClick={onClose}
      />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-dark-900 max-w-2xl w-full rounded-2xl overflow-hidden">
          <div className="p-5">
            {/* Header with Logo */}
            <div className="flex items-center gap-4 mb-5">
              {/* Logo and name section */}
              <div className="flex items-center gap-4 flex-grow">
                {token.logoUrl && (
                  <Image
                    src={token.logoUrl}
                    alt={token.name}
                    width={48}
                    height={48}
                    className="rounded-full object-cover"
                    onError={(e) => {
                      console.error('Error loading image:', token.logoUrl);
                      e.currentTarget.src = '/images/tokens/unknown.png';
                    }}
                    unoptimized={true}
                  />
                )}
                <div>
                  <h3 className="text-2xl font-bold text-grey mb-1">
                    {token.name} <span className="text-secondary">({token.symbol})</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://songbird-explorer.flare.network/address/${token.tokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue hover:text-high-emphesis text-sm"
                    >
                      {truncateAddress(token.tokenAddress)}
                    </a>
                    <div className="relative flex items-center gap-1">
                      <button
                        onClick={handleCopy}
                        className="text-secondary hover:text-high-emphesis transition-colors"
                      >
                        <span role="img" aria-label="copy" className="text-sm">
                          📋
                        </span>
                      </button>
                      {showAddressCopied && (
                        <span className="absolute left-full ml-2 whitespace-nowrap text-xs text-green animate-fade-in-out">
                          Copied!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Share button */}
              <div className="relative">
                <button
                  onClick={handleShare}
                  className="text-blue hover:text-high-emphesis transition-colors"
                >
                  <span role="img" aria-label="share" className="text-lg">
                    📤
                  </span>
                </button>
                {showUrlCopied && (
                  <span className="absolute right-full mr-2 whitespace-nowrap text-xs text-green animate-fade-in-out">
                    Copied!
                  </span>
                )}
              </div>
            </div>

            {/* Token Information Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="p-4">
                <div className="space-y-3">
                  <h4 className="text-grey font-extrabold text-xl">Token Details</h4>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="text-grey">Total Supply:</span>{' '}
                      <span className="text-secondary">{formatTotalSupply(token.totalSupply)}</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-grey">Market Cap:</span>{' '}
                      <span className="text-secondary">
                        {formatMarketCapWithFallback(token.marketCap, false)}
                      </span>
                    </p>
                    <p className="text-sm">
                      <span className="text-grey">Price:</span>{' '}
                      <span className="text-secondary">{formatPrice(token.price)}</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-grey">Holders:</span>{' '}
                      <span className="text-secondary">{token.holders?.toLocaleString() || '0'}</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-grey">Creator:</span>{' '}
                      <a
                        href={`https://songbird-explorer.flare.network/address/${token.creatorAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue hover:text-high-emphesis"
                      >
                        {truncateAddress(token.creatorAddress)}
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="space-y-3">
                  <h4 className="text-grey font-extrabold text-xl">Launch Details</h4>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="text-grey">LP Allocation:</span>{' '}
                      <span className="text-secondary">{token.lpAllocation}%</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-grey">Dev Allocation:</span>{' '}
                      <span className="text-secondary">{token.devAllocation}%</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-grey">Initial Liquidity:</span>{' '}
                      <span className="text-secondary">{token.initialLiquidity} SGB</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="p-4 mb-5">
              <div className="space-y-2">
                <h4 className="text-grey font-extrabold text-xl">Description</h4>
                <p className="text-sm text-secondary whitespace-pre-wrap">
                  {token.description || 'No description available'}
                </p>
              </div>
            </div>

            {/* Links */}
            <div className="p-4 mb-5">
              <div className="space-y-2">
                <h4 className="text-grey font-extrabold text-xl">Links</h4>
                <div className="flex flex-wrap gap-4">
                  <a
                    href={token.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:text-high-emphesis text-sm flex items-center gap-1"
                  >
                    🌐 Website
                  </a>
                  <a
                    href={`https://songbird-explorer.flare.network/address/${token.tokenAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:text-high-emphesis text-sm flex items-center gap-1"
                  >
                    🔍 Token Contract
                  </a>
                  <a
                    href={`https://songbird-explorer.flare.network/address/${token.lpAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:text-high-emphesis text-sm flex items-center gap-1"
                  >
                    🌊 LP Contract
                  </a>
                  <a
                    href={`https://www.geckoterminal.com/songbird/pools/${token.lpAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:text-high-emphesis text-sm flex items-center gap-1"
                  >
                    📊 Chart
                  </a>
                  <a
                    href={`/swap?inputCurrency=SGB&outputCurrency=${token.tokenAddress}`}
                    className="text-blue hover:text-high-emphesis text-sm flex items-center gap-1"
                  >
                    💱 Swap
                  </a>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="bg-blue hover:bg-blue/80 text-high-emphesis px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Update the fetchHoldersCount function
const fetchHoldersCount = async (tokenAddress: string) => {
  try {
    const response = await axios.get(
      `https://songbird-explorer.flare.network/api/v2/tokens/${tokenAddress}/counters`
    )

    if (response.data && response.data.token_holders_count) {
      return parseInt(response.data.token_holders_count)
    }

    return 0
  } catch (error) {
    console.error('Error fetching holders count:', error)
    return 0
  }
}

// Add these helper functions at the top
const formatPriceWithFallback = (price: number | undefined | null, isLoading: boolean) => {
  if (isLoading) return '🔄'  // Loading
  if (!price) return '❓'      // Failed or not available
  return price < 0.01 ? `$${price.toFixed(6)}` : `$${price.toFixed(2)}`
}

const formatMarketCapWithFallback = (marketCap: number | undefined | null, isLoading: boolean) => {
  if (isLoading) return '🔄'  // Loading
  if (!marketCap) return '❓'  // Failed or not available

  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(1)}M`
  if (marketCap >= 1e3) return `$${(marketCap / 1e3).toFixed(1)}K`
  if (marketCap < 1) return `$${marketCap.toFixed(6)}`
  return `$${marketCap.toFixed(2)}`
}

const formatHoldersWithFallback = (holders: number | undefined | null, isLoading: boolean) => {
  if (isLoading) return '🔄'  // Loading
  if (!holders) return '❓'    // Failed or not available
  return holders.toLocaleString()
}

export default function Tokens() {
  const { library } = useActiveWeb3React()
  const [tokens, setTokens] = useState<TokenData[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [sortBy, setSortBy] = useState<keyof TokenData>('launchDate')
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null)
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false)
  const [loadingStates, setLoadingStates] = useState<{
    [key: string]: {
      price: boolean;
      marketCap: boolean;
      holders: boolean;
    }
  }>({})
  const router = useRouter()
  const { token } = router.query // Get token address from URL if present
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoading(true)

        // Fetch tokens from Firestore first - try both string and number chainId
        let snapshot;
        try {
          // First try with string chainId
          const tokensQuery = query(
            collection(db, 'tokens'), 
            where('chainId', '==', '19'),
            orderBy('createdAt', 'desc')
          )
          snapshot = await getDocs(tokensQuery)
          
          // If no results, try with number chainId
          if (snapshot.empty) {
            const tokensQueryNum = query(
              collection(db, 'tokens'), 
              where('chainId', '==', 19),
              orderBy('createdAt', 'desc')
            )
            snapshot = await getDocs(tokensQueryNum)
          }
          
          // If still no results, get all tokens and filter manually
          if (snapshot.empty) {
            console.log('No tokens found with chainId filter, fetching all tokens...')
            const allTokensQuery = query(collection(db, 'tokens'), orderBy('createdAt', 'desc'))
            snapshot = await getDocs(allTokensQuery)
          }
        } catch (error) {
          console.error('Error with filtered query, falling back to all tokens:', error)
          // Fallback to getting all tokens
          const allTokensQuery = query(collection(db, 'tokens'), orderBy('createdAt', 'desc'))
          snapshot = await getDocs(allTokensQuery)
        }
        let tokensList = snapshot.docs
          .map(doc => {
            const data = doc.data()
            return {
              name: data.name || '',
              symbol: data.symbol || '',
              tokenAddress: data.tokenAddress || '',
              lpAddress: data.lpAddress || '',
              description: data.description || '',
              website: data.website || '',
              logoUrl: data.logoUrl || '/images/tokens/unknown.png',
              launchDate: data.launchDate?.toDate() || new Date(),
              lpAllocation: data.lpAllocation || '0',
              devAllocation: data.devAllocation || '0',
              initialLiquidity: data.initialLiquidity || '0',
              chainId: data.chainId || '19',
              totalSupply: data.totalSupply || '0',
              creatorAddress: data.creatorAddress || '',
              createdAt: data.createdAt?.toDate() || new Date(),
              price: null,
              marketCap: null,
              holders: 0
            } as TokenData
          })
          .filter(token => {
            // Filter for chainId 19 (Songbird) - handle both string and number
            const chainId = token.chainId
            return chainId === '19' || chainId === '0x13' || Number(chainId) === 19
          })

        console.log('Total documents fetched:', snapshot.docs.length)
        console.log('Tokens after chainId filtering:', tokensList.length)
        console.log('Sample token chainIds:', snapshot.docs.slice(0, 3).map(doc => ({ 
          chainId: doc.data().chainId, 
          symbol: doc.data().symbol 
        })))

        // Show tokens immediately
        setLoading(false)
        setTokens(tokensList)

        // Then fetch additional data in the background
        if (library && library.provider) {
          console.log('Starting to fetch additional data for tokens...')

          for (const token of tokensList) {
            try {
              console.log(`Fetching data for token ${token.symbol}...`)

              // Get holders count first since it's independent of web3
              const holders = await fetchHoldersCount(token.tokenAddress)
              console.log(`Got holders for ${token.symbol}:`, holders)

              // Get price from LP
              const price = await calculateTokenPrice(token.lpAddress, token.tokenAddress, library)
              console.log(`Got price for ${token.symbol}:`, price)

              // Calculate market cap
              const marketCap = await calculateMarketCap(token.tokenAddress, price, library)
              console.log(`Got market cap for ${token.symbol}:`, marketCap)

              // Update the token with new data
              setTokens(prevTokens =>
                prevTokens.map(t =>
                  t.tokenAddress === token.tokenAddress
                    ? { ...t, price, marketCap, holders }
                    : t
                )
              )
            } catch (error) {
              console.error(`Error fetching data for token ${token.symbol}:`, error)
            }
          }
        } else {
          console.log('Web3 library not available')
        }

      } catch (error) {
        console.error('Error fetching tokens:', error)
        setLoading(false)
      }
    }

    fetchTokens()
  }, [library]) // Add library as dependency

  // Add filtered tokens
  const filteredTokens = tokens.filter(token => {
    const searchTermLower = searchTerm.toLowerCase()
    return (
      (token.name?.toLowerCase() || '').includes(searchTermLower) ||
      (token.symbol?.toLowerCase() || '').includes(searchTermLower) ||
      (token.tokenAddress?.toLowerCase() || '').includes(searchTermLower)
    )
  })

  // Get current page tokens
  const currentTokens = filteredTokens.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  )

  // Add handleSort function
  const handleSort = (column: keyof TokenData | 'price' | 'marketCap') => {
    if (sortBy === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column as keyof TokenData)
      setSortDirection('asc')
    }
  }

  // Add handleTokenClick function
  const handleTokenClick = (token: TokenData) => {
    setSelectedToken(token)
    setIsDescriptionModalOpen(true)
    // Add the token address to the URL without page reload
    router.replace(`/tokens?token=${token.tokenAddress}`, undefined, { shallow: true })
  }

  // Add this effect to handle direct links to tokens
  useEffect(() => {
    const handleInitialToken = async () => {
      if (token && typeof token === 'string' && initialLoad) {
        // Find the token in the list
        const tokenData = tokens.find(t =>
          t.tokenAddress.toLowerCase() === token.toLowerCase()
        )

        if (tokenData) {
          setSelectedToken(tokenData)
          setIsDescriptionModalOpen(true)
        }

        setInitialLoad(false)
      }
    }

    if (tokens.length > 0) {
      handleInitialToken()
    }
  }, [token, tokens, initialLoad])

  // Update your modal close handler to update the URL
  const handleModalClose = () => {
    setIsDescriptionModalOpen(false)
    setSelectedToken(null)
    // Remove the token query parameter when closing the modal
    router.replace('/tokens', undefined, { shallow: true })
  }

  return (
    <Container id="tokens-page" className="py-4 md:py-8 lg:py-12" maxWidth="7xl">
      <Head>
        <title>Tokens | OwlSwap</title>
        <meta key="description" name="description" content="NEXUSSwap tokens." />
        <meta key="twitter:description" name="twitter:description" content="NEXUSSwap tokens." />
        <meta key="og:description" property="og:description" content="NEXUSSwap tokens." />
      </Head>

      <div className="max-w-4xl mx-auto mb-8">
        <Typography
          variant="hero"
          className="text-high-emphesis text-center text-sm sm:text-lg md:text-2xl lg:text-4xl font-bold"
        >
          🎇Launched Tokens
        </Typography>
      </div>

      <div className="flex flex-col gap-4">
        {/* Search Box - Made responsive */}
        <div className="w-full px-2 sm:px-4">
          <input
            type="text"
            placeholder="Search by name, symbol, or address..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(0)
            }}
            className="w-full p-2 rounded bg-dark-900 text-grey text-sm border border-dark-700 focus:border-blue"
          />
        </div>

        {/* Wrap both header and content in the same scrollable container */}
        <div className="w-full overflow-x-auto px-2 sm:px-4">
          <div className="min-w-[1000px]">
            {/* Table Header */}
            <div className="grid grid-cols-10">
              {/* Token Info */}
              <div className="col-span-2 flex gap-1 items-center cursor-pointer p-3"
                onClick={() => handleSort('name')}>
                <Typography variant="sm" weight={700}>
                  Token 📜
                </Typography>
                {sortBy === 'name' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* Price */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('price')}>
                <Typography variant="sm" weight={700}>
                  Price 💰
                </Typography>
                {sortBy === 'price' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* Market Cap */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('marketCap')}>
                <Typography variant="sm" weight={700}>
                  Market Cap 📊
                </Typography>
                {sortBy === 'marketCap' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* Total Supply */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('totalSupply')}>
                <Typography variant="sm" weight={700}>
                  Supply 📈
                </Typography>
                {sortBy === 'totalSupply' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* Dev Allocation */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('devAllocation')}>
                <Typography variant="sm" weight={700}>
                  Dev Alloc 👨‍
                </Typography>
                {sortBy === 'devAllocation' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* LP Allocation */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('lpAllocation')}>
                <Typography variant="sm" weight={700}>
                  LP Alloc 🔥
                </Typography>
                {sortBy === 'lpAllocation' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* Initial Liquidity */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('initialLiquidity')}>
                <Typography variant="sm" weight={700}>
                  Initial SGB 💎
                </Typography>
                {sortBy === 'initialLiquidity' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* Holders */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('holders')}>
                <Typography variant="sm" weight={700}>
                  Holders 👥
                </Typography>
                {sortBy === 'holders' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>

              {/* Created */}
              <div className="flex gap-1 items-center cursor-pointer justify-end p-3"
                onClick={() => handleSort('createdAt')}>
                <Typography variant="sm" weight={700}>
                  Created ⏰
                </Typography>
                {sortBy === 'createdAt' && (
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>
            </div>

            {/* Table Content */}
            <div className="divide-y divide-dark-900">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <Typography variant="lg" className="text-secondary">
                      Loading tokens...
                    </Typography>
                  </div>
                </div>
              ) : currentTokens.length === 0 ? (
                <div className="p-4 text-center">
                  <Typography variant="sm" className="text-secondary">
                    {searchTerm ? 'No tokens found matching your search' : 'No tokens found'}
                  </Typography>
                </div>
              ) : (
                currentTokens.map((token, i) => {
                  console.log('Token logo URL:', token.symbol, token.logoUrl);
                  return (
                    <div
                      key={token.tokenAddress}
                      className={classNames(
                        'p-4 cursor-pointer transition-colors duration-200 hover:bg-green/20',
                        i % 2 === 0 ? 'bg-dark-800' : 'bg-dark-900'
                      )}
                      onClick={() => handleTokenClick(token)}
                    >
                      <div className="grid grid-cols-10 gap-4 items-center">
                        {/* Token Info */}
                        <div className="col-span-2 flex items-center gap-3">
                          <div className="w-12 h-12 flex-shrink-0">
                            {token.logoUrl && (
                              <Image
                                src={token.logoUrl}
                                alt={token.name}
                                width={48}
                                height={48}
                                className="rounded-full object-cover"
                                onError={(e) => {
                                  console.error('Error loading image:', token.logoUrl);
                                  e.currentTarget.src = '/images/tokens/unknown.png';
                                }}
                                unoptimized={true}
                                loading="lazy"
                              />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <Typography variant="lg" className="text-blue font-bold truncate">
                                {token.website ? (
                                  <a
                                    href={token.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-high-emphesis"
                                  >
                                    {token.name}
                                  </a>
                                ) : token.name}
                              </Typography>
                              <Typography variant="sm" className="text-secondary whitespace-nowrap">
                                [{token.symbol}]
                              </Typography>
                            </div>
                            <Typography variant="xs" className="text-secondary truncate">
                              <a
                                href={`https://songbird-explorer.flare.network/address/${token.tokenAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-high-emphesis"
                              >
                                {truncateAddress(token.tokenAddress)}
                              </a>
                            </Typography>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {token.website && (
                                <a href={token.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue hover:text-high-emphesis"
                                >
                                  <span role="img" aria-label="website" className="text-base">
                                    🌐
                                  </span>
                                </a>
                              )}
                              <a
                                href={`https://www.geckoterminal.com/songbird/pools/${token.lpAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue hover:text-high-emphesis text-sm flex items-center gap-1"
                              >
                                📊 Chart
                              </a>
                              <a
                                href={`/swap?inputCurrency=SGB&outputCurrency=${token.tokenAddress}`}
                                className="text-blue hover:text-high-emphesis"
                              >
                                <span role="img" aria-label="swap" className="text-base">
                                  💱
                                </span>
                              </a>
                              <a href={`https://songbird-explorer.flare.network/address/${token.lpAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue hover:text-high-emphesis"
                              >
                                <span role="img" aria-label="liquidity pool" className="text-base">
                                  🌊
                                </span>
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Price - calculated from LP */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {formatPriceWithFallback(
                              token.price,
                              loadingStates[token.tokenAddress]?.price
                            )}
                          </Typography>
                        </div>

                        {/* Market Cap - calculated */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {formatMarketCapWithFallback(
                              token.marketCap,
                              loadingStates[token.tokenAddress]?.marketCap
                            )}
                          </Typography>
                        </div>

                        {/* Total Supply - Moved here */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {formatTotalSupply(token.totalSupply)}
                          </Typography>
                        </div>

                        {/* Dev Allocation - from Firebase */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {token.devAllocation}%
                          </Typography>
                        </div>

                        {/* LP Allocation - from Firebase */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {token.lpAllocation}%
                          </Typography>
                        </div>

                        {/* Initial Liquidity - from Firebase */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {token.initialLiquidity} SGB
                          </Typography>
                        </div>

                        {/* Holders */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {formatHoldersWithFallback(
                              token.holders,
                              loadingStates[token.tokenAddress]?.holders
                            )}
                          </Typography>
                        </div>

                        {/* Created */}
                        <div className="text-right">
                          <Typography variant="xs" className="text-secondary">
                            {formatDistanceToNow(token.createdAt, { addSuffix: true })}
                          </Typography>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Pagination - Made responsive */}
        <div className="w-full px-2 sm:px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 gap-4">
            <div className="flex items-center gap-2">
              <Typography variant="sm" className="text-secondary whitespace-nowrap">
                Showing {filteredTokens.length} {searchTerm ? 'matching ' : ''}tokens
              </Typography>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value))
                  setPage(0)
                }}
                className="bg-dark-900 text-secondary p-1 rounded"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <Typography variant="sm" className="text-secondary whitespace-nowrap">
                {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, filteredTokens.length)} of {filteredTokens.length}
              </Typography>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(prev => Math.max(0, prev - 1))}
                  disabled={page === 0}
                  className="p-1 text-secondary disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(prev => prev + 1)}
                  disabled={(page + 1) * rowsPerPage >= filteredTokens.length}
                  className="p-1 text-secondary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DescriptionModal
        isOpen={isDescriptionModalOpen}
        onClose={handleModalClose}
        token={selectedToken}
      />
    </Container>
  )
}
