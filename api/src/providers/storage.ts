import type {
  IUserRepository,
  IRefreshTokenRepository,
  IRoomRepository,
  IDrawerRepository,
  ICompartmentRepository,
  ISubCompartmentRepository,
  ICategoryRepository,
} from '../storage/interfaces';

export interface IStorageProvider {
  users: IUserRepository;
  refreshTokens: IRefreshTokenRepository;
  rooms: IRoomRepository;
  drawers: IDrawerRepository;
  compartments: ICompartmentRepository;
  subCompartments: ISubCompartmentRepository;
  categories: ICategoryRepository;
}
