import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer does not exist');
    }

    const reducedProducts = Array.from(
      products.reduce(
        (m, { id, quantity }) => m.set(id, (m.get(id) || 0) + quantity),
        new Map(),
      ),
      ([id, quantity]) => ({ id, quantity }),
    );

    const storageProducts = await this.productsRepository.findAllById(
      reducedProducts,
    );

    const orderProducts = reducedProducts.map(product => {
      const sameProductOnStorage = storageProducts.find(
        storageProduct => storageProduct.id === product.id,
      );

      if (!sameProductOnStorage) {
        throw new AppError('Some products do not exist');
      }

      if (product.quantity > sameProductOnStorage.quantity) {
        throw new AppError('Product with insufficient quantity');
      }

      return {
        product_id: product.id,
        quantity: product.quantity,
        price: sameProductOnStorage.price,
      };
    });

    await this.productsRepository.updateQuantity(reducedProducts);

    const order = await this.ordersRepository.create({
      customer,
      products: orderProducts,
    });

    return order;
  }
}

export default CreateOrderService;
