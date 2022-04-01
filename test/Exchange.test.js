/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import { tokens, EVM_REVERT, ETHER_ADDRESS, ether } from './helpers'
const Exchange = artifacts.require('./Exchange')
const Token = artifacts.require('./Token')

require('chai').use(require('chai-as-promised')).should()

contract('Exchange', ([deployer, feeAccount, user1, user2]) => {
	let exchange, token
	const feePercent = 10

	beforeEach(async () => {
		// Deploy token
		token = await Token.new()

		//  Transfer some tokens to user1
		token.transfer(user1, tokens(100), { from: deployer })

		// Deploy exchange
		exchange = await Exchange.new(feeAccount, feePercent)
	})

	describe('deployment', () => {
		it('tracks the fee account', async () => {
			const result = await exchange.feeAccount()
			result.should.equal(feeAccount)
		})

		it('tracks the fee percentage', async () => {
			const result = await exchange.feePercent()
			result.toString().should.equal(feePercent.toString())
		})
	})

	describe('depositing Ether', () => {
		let result, amount

		beforeEach(async () => {
			amount = ether(1)
			result = await exchange.depositEther({ from: user1, value: amount })
		})

		it('tracks the Ether deposit', async () => {
			const balance = await exchange.tokens(ETHER_ADDRESS, user1)
			balance.toString().should.equal(amount.toString())
		})

		it('emits an Deposit event', async () => {
			const log = result.logs[0]
			log.event.should.eq('Deposit')
			const event = log.args
			event.token.should.eq(ETHER_ADDRESS, 'ether address is correct')
			event.user.should.eq(user1, 'user address is correct')
			event.amount.toString().should.eq(amount.toString(), 'amount is correct')
			event.balance.toString().should.equal(amount.toString(), 'balance is correct')
		})
	})

	describe('deposit tokens', () => {
		let result, amount

		describe('success', () => {
			beforeEach(async () => {
				amount = tokens(10)
				await token.approve(exchange.address, amount, { from: user1 })
				result = await exchange.depositToken(token.address, amount, { from: user1 })
			})

			it('tracks the token deposit', async () => {
				// check exchange token balance
				let balance
				balance = await token.balanceOf(exchange.address)
				balance.toString().should.equal(amount.toString())
				balance = await exchange.tokens(token.address, user1)
				balance.toString().should.equal(amount.toString())
			})

			it('emits an Deposit event', async () => {
				const log = result.logs[0]
				log.event.should.eq('Deposit')
				const event = log.args
				event.token.should.eq(token.address, 'token address is correct')
				event.user.should.eq(user1, 'user address is correct')
				event.amount.toString().should.eq(amount.toString(), 'amount is correct')
				event.balance.toString().should.equal(amount.toString(), 'balance is correct')
			})
		})

		describe('failure', () => {
			it('fails when no tokens are approved', async () => {
				await exchange.depositToken(token.address, amount, { from: user1 }).should.be.rejectedWith(EVM_REVERT)
			})

			it('rejectes Ether Deposit', async () => {
				await exchange
					.depositToken(ETHER_ADDRESS, tokens(10), {
						from: user1,
					})
					.should.be.rejectedWith(EVM_REVERT)
			})
		})
	})

	describe('fallback', () => {
		it('reverts when Ether is sent', async () => {
			await exchange.sendTransaction({ from: user1, value: 1 }).should.be.rejectedWith(EVM_REVERT)
		})
	})

	describe('withdrawing Ether', () => {
		let result, amount

		beforeEach(async () => {
			amount = ether(1)
			result = await exchange.depositEther({ from: user1, value: amount })
		})

		describe('success', () => {
			beforeEach(async () => {
				await exchange.withdrawEther(amount, { from: user1 })
			})

			it('withdraws Ether funds', async () => {
				const balance = await exchange.tokens(ETHER_ADDRESS, user1)
				balance.toString().should.equal('0')
			})

			it('emits a Withdraw event', async () => {
				const log = result.logs[0]
				console.log(log)
				log.event.should.eq('Withdraw')
				const event = log.args
				event.token.should.eq(ETHER_ADDRESS)
				event.user.should.eq(user1)
				event.amount.toString().should.eq(amount.toString())
				event.balance.toString().should.equal('0')
			})
		})

		describe('failure', () => {
			it('reject withdraws for insufficient balance', async () => {
				await exchange.withdrawEther(ether(100), { from: user1 }).should.be.rejectedWith(EVM_REVERT)
			})
		})
	})

	describe('withdrawing tokens', () => {
		let result, amount

		beforeEach(async () => {
			amount = tokens(1)
			result = await exchange.depositEther({ from: user1, value: amount })
		})

		describe('success', () => {
			beforeEach(async () => {
				amount = tokens(1)
				await token.approve(exchange.address, amount, { from: user1 })
				await exchange.depositToken(token.address, amount, { from: user1 })

				result = await exchange.withdrawToken(token.address, amount, { from: user1 })
			})

			it('withdraws token funds', async () => {
				const balance = await exchange.tokens(token.address, user1)
				balance.toString().should.equal('0')
			})

			it('emits a Withdraw event', async () => {
				const log = result.logs[0]
				log.event.should.eq('Withdraw')
				const event = log.args
				event.token.should.eq(token.address)
				event.user.should.eq(user1)
				event.amount.toString().should.eq(amount.toString())
				event.balance.toString().should.equal('0')
			})
		})

		describe('failure', () => {
			it('reject ether withdraws', async () => {
				await exchange.withdrawToken(ETHER_ADDRESS, tokens(10), { from: user1 }).should.be.rejectedWith(EVM_REVERT)
			})

			it('fails for insufficient balances', async () => {
				await exchange.withdrawToken(token.address, tokens(10), { from: user1 }).should.be.rejectedWith(EVM_REVERT)
			})
		})
	})

	describe('checking balances', async () => {
		beforeEach(async () => {
			await exchange.depositEther({ from: user1, value: ether(1) })
		})

		it('returns user balance', async () => {
			const result = await exchange.balanceOf(ETHER_ADDRESS, user1)
			result.toString().should.be.equal(ether(1).toString())
		})
	})

	describe('making orders', () => {
		let result

		beforeEach(async () => {
			result = await exchange.makeOrder(token.address, tokens(1), ETHER_ADDRESS, ether(1), { from: user1 })
		})

		it('tracks the newly created order', async () => {
			const orderCount = await exchange.orderCount()
			orderCount.toString().should.equal('1')
			const order = await exchange.orders('1')
			order.id.toString().should.equal('1', 'id is correct')
			order.user.should.equal(user1, 'user is correct')
			order.tokenGet.should.equal(token.address, 'tokenGet is correct')
			order.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
			order.tokenGive.toString().should.equal(ETHER_ADDRESS, 'tokenGive is correct')
			order.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
			order.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
		})

		it('emits an order event', async () => {
			const log = result.logs[0]
			log.event.should.equal('Order')
			const event = log.args
			event.id.toString().should.equal('1', 'id is correct')
			event.user.should.equal(user1, 'user is correct')
			event.tokenGet.should.equal(token.address, 'tokenGet is correct')
			event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
			event.tokenGive.toString().should.equal(ETHER_ADDRESS, 'tokenGive is correct')
			event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
			event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
		})
	})

	describe('order actions', () => {
		let result
		beforeEach(async () => {
			// user1 deposits ether only
			await exchange.depositEther({ from: user1, value: ether(1) })
			// give tokens to user2
			await token.transfer(user2, tokens(100), { from: deployer })
			// user2 deposits tokens only
			await token.approve(exchange.address, tokens(2), { from: user2 })
			await exchange.depositToken(token.address, tokens(2), { from: user2 })
			// user1 makes and order to buy tokens with ether
			await exchange.makeOrder(token.address, tokens(1), ETHER_ADDRESS, ether(1), { from: user1 })
		})

		describe('filling orders', () => {
			describe('success', () => {
				beforeEach(async () => {
					result = await exchange.fillOrder('1', { from: user2 })
				})

				it('executes the trade & charges fees', async () => {
					let balance
					balance = await exchange.balanceOf(token.address, user1)
					balance.toString().should.equal(tokens(1).toString(), 'user1 received tokens')
					balance = await exchange.balanceOf(ETHER_ADDRESS, user2)
					balance.toString().should.equal(ether(1).toString(), 'user2 received Ether')
					balance = await exchange.balanceOf(ETHER_ADDRESS, user1)
					balance.toString().should.equal('0', 'user1 Ether deducted')
					balance = await exchange.balanceOf(token.address, user2)
					balance.toString().should.equal(tokens(0.9).toString(), 'user2 tokens deducted with fee applied')
					const feeAccount = await exchange.feeAccount()
					balance = await exchange.balanceOf(token.address, feeAccount)
					balance.toString().should.equal(tokens(0.1).toString(), 'feeAccount received fee')
				})

				it('updates filled orders', async () => {
					const orderFilled = await exchange.orderFilled(1)
					orderFilled.should.equal(true)
				})

				it('emits a "Trade" event', () => {
					const log = result.logs[0]
					log.event.should.eq('Trade')
					const event = log.args
					event.id.toString().should.equal('1', 'id is correct')
					event.user.should.equal(user1, 'user is correct')
					event.tokenGet.should.equal(token.address, 'tokenGet is correct')
					event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
					event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
					event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
					event.userFill.should.equal(user2, 'userFill is correct')
					event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
				})
			})

			describe('failure', () => {
				it('rejects invalid order ids', async () => {
					const invalidOrderId = 99999
					await exchange.fillOrder(invalidOrderId, { from: user2 }).should.be.rejectedWith(EVM_REVERT)
				})

				it('rejects already-filled orders', async () => {
					// fill the order
					await exchange.fillOrder('1', { from: user2 }).should.be.fulfilled
					// try to fill the same order
					await exchange.fillOrder('1', { from: user2 }).should.be.rejectedWith(EVM_REVERT)
				})

				it('rejects cancelled orders', async () => {
					// cancel the order
					await exchange.cancelOrder('1', { from: user1 }).should.be.fulfilled
					// try to fill the same order
					await exchange.fillOrder('1', { from: user2 }).should.be.rejectedWith(EVM_REVERT)
				})
			})
		})

		describe('cancelling orders', () => {
			let result

			describe('success', () => {
				beforeEach(async () => {
					result = await exchange.cancelOrder('1', { from: user1 })
				})

				it('updates cancelled orders', async () => {
					const orderCancelled = await exchange.orderCancelled(1)
					orderCancelled.should.equal(true)
				})

				it('emits an cancel event', async () => {
					const log = result.logs[0]
					log.event.should.equal('Cancel')
					const event = log.args
					event.id.toString().should.equal('1', 'id is correct')
					event.user.should.equal(user1, 'user is correct')
					event.tokenGet.should.equal(token.address, 'tokenGet is correct')
					event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
					event.tokenGive.toString().should.equal(ETHER_ADDRESS, 'tokenGive is correct')
					event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
					event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
				})
			})

			describe('failure', () => {
				it('rejects invalid order ids', async () => {
					await exchange.cancelOrder(999999, { from: user1 }).should.be.rejectedWith(EVM_REVERT)
				})

				it('rejects unauthorize cancelation', async () => {
					await exchange.cancelOrder(1, { from: user2 }).should.be.rejectedWith(EVM_REVERT)
				})
			})
		})
	})
})
