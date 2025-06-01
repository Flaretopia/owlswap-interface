import { NATIVE } from '@sushiswap/core-sdk'
import Container from 'app/components/Container'
import { NAV_CLASS } from 'app/components/Header/styles'
import useMenu from 'app/components/Header/useMenu'
import Web3Network from 'app/components/Web3Network'
import Web3Status from 'app/components/Web3Status'
import useIsCoinbaseWallet from 'app/hooks/useIsCoinbaseWallet'
import { useActiveWeb3React } from 'app/services/web3'
import { useETHBalances } from 'app/state/wallet/hooks'
// import Image from 'next/image'
import Link from 'next/link'
import React, { FC, useState } from 'react'
import { NavigationItem } from './NavigationItem'
import LogoImage from '../../../public/icons/icon-72x72.png'
// import Typography from 'app/components/Typography'
// import { XIcon } from '@heroicons/react/outline'
import { useDexWarningOpen, useToggleDexWarning } from 'app/state/application/hooks'
import ExternalLink from '../ExternalLink'
import { classNames } from 'app/functions'
import { XIcon } from '@heroicons/react/outline'
import Typography from 'app/components/Typography'

const HEADER_HEIGHT = 64

const Desktop: FC = () => {
  const menu = useMenu()
  const { account, chainId, library } = useActiveWeb3React()
  const userEthBalance = useETHBalances(account ? [account] : [])?.[account ?? '']
  const isCoinbaseWallet = useIsCoinbaseWallet()
  const [showAlert, setShowAlert] = useState(true)

  const toggleWarning = useToggleDexWarning()
  const showUseDexWarning = useDexWarningOpen()

  return (
    <>
      <header className="fixed z-20 hidden w-full lg:block" style={{ height: HEADER_HEIGHT }}>
        {showUseDexWarning && (
          <div className="py-2 text-[1rem] text-white bg-[#e62058] relative text-center rounded-b-lg mx-4">
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div
                className="flex items-center justify-center w-6 h-6 cursor-pointer hover:text-white/80"
                onClick={toggleWarning}
              >
                <XIcon width={24} height={24} className="text-white" />
              </div>
            </div>
            <Typography variant="xs" weight={700} className="text-[1rem] text-white">
              OracleSwap has been rebranded to <a href="https://owlswap.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/80">OwlSwap</a> by <a href="https://flaretopia.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/80">Flaretopia</a>!
            </Typography>
          </div>
        )}
        <nav className={classNames(NAV_CLASS, showUseDexWarning && 'before:backdrop-blur-[20px]')}>
          <Container maxWidth="7xl" className="mx-auto">
            <div className="flex items-center justify-between gap-4 px-6">
              <div className="flex gap-4">
                <div className="flex items-center mr-4">
                  <ExternalLink href="https://www.flaretopia.com/">
                    <img src={LogoImage.src} className={'w-[40px] h-[40px]'} alt="Logo" />
                    {/* <Image src="/logo.png" alt="OwlSwap logo" width="24px" height="24px" /> */}
                  </ExternalLink>
                </div>

                {menu.map((node) => {
                  return <NavigationItem node={node} key={node.key} />
                })}
              </div>
              <div className="flex items-center justify-end gap-2">
                {library && (library.provider.isMetaMask || isCoinbaseWallet) && (
                  <div className="hidden sm:inline-block">
                    <Web3Network />
                  </div>
                )}

                <div className="flex items-center w-auto text-sm font-bold border-2 rounded shadow cursor-pointer pointer-events-auto select-none border-dark-800 hover:border-dark-700 bg-dark-900 whitespace-nowrap">
                  {account && chainId && userEthBalance && (
                    <Link href="/portfolio" passHref={true}>
                      <a className="hidden px-3 text-high-emphesis text-bold md:block">
                        {/*@ts-ignore*/}
                        {userEthBalance?.toSignificant(4)} {NATIVE[chainId || 1].symbol}
                      </a>
                    </Link>
                  )}
                  <Web3Status />
                </div>
              </div>
            </div>
          </Container>
        </nav>
      </header>
      <div style={{ height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT }} />
    </>
  )
}

export default Desktop
